"""
Fetch and populate 1 year of daily prices into Turso for all companies in the universe.
High-speed batching with yfinance + multi-row libSQL inserts.
"""
import os
import sys
import time
from pathlib import Path
import yfinance as yf
import libsql
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").strip().replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

if not TURSO_URL or not TURSO_TOKEN:
    print("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required in environment.")
    sys.exit(1)

conn = libsql.connect(TURSO_URL, auth_token=TURSO_TOKEN)

# 1. Get all active symbols from Turso
cur = conn.execute("SELECT symbol FROM companies WHERE is_active = 1 ORDER BY symbol")
all_symbols = [r[0] for r in cur.fetchall()]
print(f"Total active companies in Turso: {len(all_symbols)}")

# 2. Check which symbols already have prices
cur = conn.execute("SELECT DISTINCT symbol FROM prices_daily")
existing_symbols = {r[0] for r in cur.fetchall()}
print(f"Symbols already having prices: {len(existing_symbols)}")

symbols_to_fetch = [s for s in all_symbols if s not in existing_symbols]
print(f"Symbols to fetch: {len(symbols_to_fetch)}")

if not symbols_to_fetch:
    print("All symbols already have prices. Done!")
    sys.exit(0)

BATCH_SIZE = 40
CHUNK_INSERT = 100

for b_idx in range(0, len(symbols_to_fetch), BATCH_SIZE):
    batch = symbols_to_fetch[b_idx : b_idx + BATCH_SIZE]
    ticker_map = {f"{s}.NS": s for s in batch}
    tickers_list = list(ticker_map.keys())
    
    t0 = time.time()
    print(f"[{b_idx + 1}-{min(b_idx + BATCH_SIZE, len(symbols_to_fetch))}/{len(symbols_to_fetch)}] Downloading {len(batch)} tickers...", flush=True)
    
    try:
        data = yf.download(
            tickers_list,
            period="1y",
            interval="1d",
            group_by="ticker",
            threads=True,
            progress=False
        )
    except Exception as e:
        print(f"  -> yf.download failed: {e}", flush=True)
        time.sleep(2)
        continue

    rows_to_insert = []
    for ticker_ns, sym in ticker_map.items():
        try:
            if len(batch) == 1:
                df = data.dropna(how="all")
            else:
                if ticker_ns not in data:
                    continue
                df = data[ticker_ns].dropna(how="all")

            for dt, r in df.iterrows():
                try:
                    c = float(r["Close"])
                    o = float(r["Open"]) if "Open" in r and not r.isna()["Open"] else c
                    h = float(r["High"]) if "High" in r and not r.isna()["High"] else c
                    l = float(r["Low"]) if "Low" in r and not r.isna()["Low"] else c
                    v = int(r["Volume"]) if "Volume" in r and not r.isna()["Volume"] else 0
                    d_str = dt.strftime("%Y-%m-%d")
                    rows_to_insert.append((sym, d_str, o, h, l, c, v))
                except Exception:
                    continue
        except Exception:
            continue

    if rows_to_insert:
        # Multi-row batch insertion for maximum speed
        for i in range(0, len(rows_to_insert), CHUNK_INSERT):
            chunk = rows_to_insert[i : i + CHUNK_INSERT]
            placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?)"] * len(chunk))
            sql = f"INSERT OR REPLACE INTO prices_daily (symbol, date, open, high, low, close, volume) VALUES {placeholders}"
            flat_params = [item for sublist in chunk for item in sublist]
            conn.execute(sql, flat_params)
        conn.commit()
    
    elapsed = round(time.time() - t0, 1)
    print(f"  -> Done in {elapsed}s: {len(rows_to_insert)} price rows committed.", flush=True)

cur = conn.execute("SELECT count(*) FROM prices_daily")
print(f"Finished! Total prices_daily in Turso: {cur.fetchone()[0]}", flush=True)

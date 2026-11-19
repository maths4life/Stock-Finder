"""
Fetch and populate MAX (all-time historical inception data) price history into Turso
for all companies in the universe.
Resumable, high-speed multi-row libSQL batch insertions.
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
    print("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required in environment.", flush=True)
    sys.exit(1)

conn = libsql.connect(TURSO_URL, auth_token=TURSO_TOKEN)

# 1. Get all active symbols from Turso
cur = conn.execute("SELECT symbol FROM companies WHERE is_active = 1 ORDER BY symbol")
all_symbols = [r[0] for r in cur.fetchall()]
print(f"Total active companies in universe: {len(all_symbols)}", flush=True)

# 2. Check which symbols already have full MAX history (>= 1000 bars)
cur = conn.execute("SELECT symbol FROM prices_daily GROUP BY symbol HAVING count(*) >= 1000")
already_max = {r[0] for r in cur.fetchall()}
print(f"Companies already having complete multi-year max history: {len(already_max)}", flush=True)

symbols_to_fetch = [s for s in all_symbols if s not in already_max]
print(f"Companies to backfill with full MAX history: {len(symbols_to_fetch)}", flush=True)

if not symbols_to_fetch:
    print("All companies already have full MAX price history!", flush=True)
    sys.exit(0)

BATCH_SIZE = 15
CHUNK_INSERT = 200

for b_idx in range(0, len(symbols_to_fetch), BATCH_SIZE):
    batch = symbols_to_fetch[b_idx : b_idx + BATCH_SIZE]
    ticker_map = {f"{s}.NS": s for s in batch}
    tickers_list = list(ticker_map.keys())

    t0 = time.time()
    batch_num = (b_idx // BATCH_SIZE) + 1
    total_batches = (len(symbols_to_fetch) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"[{batch_num}/{total_batches}] Downloading MAX history for {len(batch)} tickers ({', '.join(batch[:4])}...)", flush=True)

    try:
        data = yf.download(
            tickers_list,
            period="max",
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

            if df is None or df.empty:
                continue

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
        for i in range(0, len(rows_to_insert), CHUNK_INSERT):
            chunk = rows_to_insert[i : i + CHUNK_INSERT]
            placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?)"] * len(chunk))
            sql = f"INSERT OR REPLACE INTO prices_daily (symbol, date, open, high, low, close, volume) VALUES {placeholders}"
            flat_params = [item for sublist in chunk for item in sublist]
            conn.execute(sql, flat_params)
        conn.commit()

    elapsed = round(time.time() - t0, 1)
    print(f"  -> Committed {len(rows_to_insert):,} bars in {elapsed}s", flush=True)

cur = conn.execute("SELECT count(*) FROM prices_daily")
print(f"All done! Total rows in prices_daily: {cur.fetchone()[0]:,}", flush=True)

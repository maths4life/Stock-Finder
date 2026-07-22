"""Computes technical indicators from stored price history and writes a
one-row-per-symbol snapshot to technical_snapshot.

Deliberately reads from the DB, not from yfinance — this keeps the
"fetch" and "compute" steps independent, so indicator logic can change
without needing to re-fetch anything.

Usage:
    python -m ingest.compute_technicals
"""
import pandas as pd
from sqlalchemy import text

from ingest.db import get_engine
from ingest.indicators import (
    compute_moving_averages,
    compute_rsi,
    compute_vwap,
    detect_death_cross,
    detect_golden_cross,
)
# Milestone 5: no change needed here. UNIVERSE now resolves through
# ingest/universe.py's CSV-backed load_universe() instead of a hardcoded
# list — this import is unchanged and transparently picks up all ~100
# companies from data/universe_top100.csv.
from ingest.universe import UNIVERSE


def load_prices(engine, symbol: str) -> pd.DataFrame:
    query = text(
        """
        select date, open, high, low, close, volume
        from prices_daily
        where symbol = :symbol
        order by date asc
        """
    )
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"symbol": symbol})
    df.rename(
        columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"},
        inplace=True,
    )
    return df


def compute_snapshot(df: pd.DataFrame) -> dict | None:
    if df.empty or len(df) < 20:
        return None

    df = compute_moving_averages(df)
    df["RSI"] = compute_rsi(df["Close"])
    df = compute_vwap(df)

    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    yearly = df.tail(252)

    change_pct = ((latest["Close"] - prev["Close"]) / prev["Close"] * 100) if prev["Close"] else None

    return {
        "as_of_date": latest["date"],
        "close": float(latest["Close"]),
        "change_pct": float(change_pct) if change_pct is not None else None,
        "rsi_14": float(latest["RSI"]) if pd.notna(latest["RSI"]) else None,
        "ma20": float(latest["MA20"]) if pd.notna(latest["MA20"]) else None,
        "ma50": float(latest["MA50"]) if pd.notna(latest["MA50"]) else None,
        "ma200": float(latest["MA200"]) if pd.notna(latest["MA200"]) else None,
        "vwap": float(latest["VWAP"]) if pd.notna(latest["VWAP"]) else None,
        "high_52w": float(yearly["High"].max()),
        "low_52w": float(yearly["Low"].min()),
        "avg_volume_20": int(yearly["Volume"].tail(20).mean()),
        "above_50dma": bool(latest["Close"] > latest["MA50"]) if pd.notna(latest["MA50"]) else None,
        "above_200dma": bool(latest["Close"] > latest["MA200"]) if pd.notna(latest["MA200"]) else None,
        "golden_cross": detect_golden_cross(df),
        "death_cross": detect_death_cross(df),
    }


def upsert_snapshot(engine, symbol: str, snap: dict):
    snap = {**snap, "symbol": symbol}
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into technical_snapshot (
                    symbol, as_of_date, close, change_pct, rsi_14,
                    ma20, ma50, ma200, vwap, high_52w, low_52w,
                    avg_volume_20, above_50dma, above_200dma, golden_cross, death_cross
                ) values (
                    :symbol, :as_of_date, :close, :change_pct, :rsi_14,
                    :ma20, :ma50, :ma200, :vwap, :high_52w, :low_52w,
                    :avg_volume_20, :above_50dma, :above_200dma, :golden_cross, :death_cross
                )
                on conflict (symbol) do update set
                    as_of_date = excluded.as_of_date,
                    close = excluded.close,
                    change_pct = excluded.change_pct,
                    rsi_14 = excluded.rsi_14,
                    ma20 = excluded.ma20,
                    ma50 = excluded.ma50,
                    ma200 = excluded.ma200,
                    vwap = excluded.vwap,
                    high_52w = excluded.high_52w,
                    low_52w = excluded.low_52w,
                    avg_volume_20 = excluded.avg_volume_20,
                    above_50dma = excluded.above_50dma,
                    above_200dma = excluded.above_200dma,
                    golden_cross = excluded.golden_cross,
                    death_cross = excluded.death_cross,
                    updated_at = now()
                """
            ),
            snap,
        )


def main():
    engine = get_engine()
    for company in UNIVERSE:
        symbol = company["symbol"]
        df = load_prices(engine, symbol)
        snap = compute_snapshot(df)
        if snap is None:
            print(f"{symbol}: not enough price history yet, skipping.")
            continue
        upsert_snapshot(engine, symbol, snap)
        print(f"{symbol}: technical snapshot updated.")


if __name__ == "__main__":
    main()

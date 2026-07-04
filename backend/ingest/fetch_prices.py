"""Daily price ingestion.

Pulls OHLCV history for the tracked universe via yfinance and upserts it
into prices_daily. Meant to run once a day (see .github/workflows/ingest.yml).

Usage:
    python -m ingest.fetch_prices
"""
import time

import pandas as pd
import yfinance as yf
from sqlalchemy import text

from ingest.db import get_engine
from ingest.universe import UNIVERSE

HISTORY_PERIOD = "2y"   # enough for MA200 / 52w stats to be accurate


def ensure_company_rows(engine):
    """Make sure every symbol in UNIVERSE exists in the companies table."""
    with engine.begin() as conn:
        for c in UNIVERSE:
            conn.execute(
                text(
                    """
                    insert into companies (symbol, yahoo_ticker, exchange, name, sector)
                    values (:symbol, :yahoo_ticker, :exchange, :name, :sector)
                    on conflict (symbol) do update set
                        yahoo_ticker = excluded.yahoo_ticker,
                        exchange = excluded.exchange,
                        name = excluded.name,
                        sector = excluded.sector
                    """
                ),
                c,
            )


def fetch_one(yahoo_ticker: str) -> pd.DataFrame | None:
    df = yf.download(
        yahoo_ticker,
        period=HISTORY_PERIOD,
        interval="1d",
        auto_adjust=False,
        progress=False,
    )
    if df.empty:
        return None

    # yfinance sometimes returns MultiIndex columns for a single ticker.
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    df = df.reset_index()
    df.rename(columns={"Date": "date"}, inplace=True)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    # Same bug fix as the original Streamlit project: Yahoo can return a
    # trailing row with NaN OHLCV for an in-progress period. Drop it so we
    # never write nulls into the price history.
    df = df.dropna(subset=["Open", "High", "Low", "Close", "Volume"])
    return df


def upsert_prices(engine, symbol: str, df: pd.DataFrame):
    rows = [
        {
            "symbol": symbol,
            "date": row.date,
            "open": float(row.Open),
            "high": float(row.High),
            "low": float(row.Low),
            "close": float(row.Close),
            "volume": int(row.Volume),
        }
        for row in df.itertuples(index=False)
    ]
    if not rows:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into prices_daily (symbol, date, open, high, low, close, volume)
                values (:symbol, :date, :open, :high, :low, :close, :volume)
                on conflict (symbol, date) do update set
                    open = excluded.open,
                    high = excluded.high,
                    low = excluded.low,
                    close = excluded.close,
                    volume = excluded.volume
                """
            ),
            rows,
        )


def main():
    engine = get_engine()
    ensure_company_rows(engine)

    for company in UNIVERSE:
        symbol = company["symbol"]
        ticker = company["yahoo_ticker"]
        print(f"Fetching {ticker} ...")
        try:
            df = fetch_one(ticker)
        except Exception as exc:
            print(f"  FAILED: {exc}")
            continue

        if df is None:
            print(f"  No data returned for {ticker}, skipping.")
            continue

        upsert_prices(engine, symbol, df)
        print(f"  Wrote {len(df)} rows for {symbol}.")

        # Be polite to Yahoo's unofficial endpoint — small delay between
        # tickers avoids the throttling that hits fast unauthenticated loops.
        time.sleep(1.5)


if __name__ == "__main__":
    main()

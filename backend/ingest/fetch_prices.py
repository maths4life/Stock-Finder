"""Daily price ingestion.

Pulls OHLCV history for the tracked universe via yfinance and upserts it
into prices_daily. Meant to run once a day (see .github/workflows/ingest.yml).

Usage:
    python -m ingest.fetch_prices
    python -m ingest.fetch_prices --full-refetch   # force full HISTORY_PERIOD
                                                    # for every symbol, ignoring
                                                    # what's already stored

Milestone 5: this used to always request HISTORY_PERIOD ("2y") for every
symbol on every run — fine at 8 companies, wasteful at ~100 (and beyond).
It's now incremental by default: for a symbol that already has rows in
prices_daily, only the days after the latest stored date are requested.
A brand-new symbol (or one explicitly forced via --full-refetch) still
gets the full backfill, since there's nothing to be incremental from yet.
"""
import argparse
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf
from sqlalchemy import bindparam, text

from ingest.db import get_engine
from ingest.universe import UNIVERSE

HISTORY_PERIOD = "2y"   # enough for MA200 / 52w stats to be accurate — used
                          # for a symbol's first-ever fetch (full backfill).


def ensure_company_rows(engine):
    """Make sure every symbol in the loaded universe exists in the
    companies table. Upsert, not insert-only — a symbol that changes
    name/sector/ticker in the CSV (e.g. the TATAMOTORS -> TMPV rename
    after Tata Motors' Oct 2025 demerger) gets its row updated in place,
    same as before this milestone."""
    with engine.begin() as conn:
        for c in UNIVERSE:
            conn.execute(
                text(
                    """
                    insert into companies (symbol, yahoo_ticker, exchange, name, sector, index_membership, is_active)
                    values (:symbol, :yahoo_ticker, :exchange, :name, :sector, :index_membership, :is_active)
                    on conflict (symbol) do update set
                        yahoo_ticker = excluded.yahoo_ticker,
                        exchange = excluded.exchange,
                        name = excluded.name,
                        sector = excluded.sector,
                        index_membership = excluded.index_membership,
                        is_active = excluded.is_active
                    """
                ),
                c,
            )


def get_latest_price_dates(engine, symbols: list) -> dict:
    """One batched query returning {symbol: latest_date_in_prices_daily}
    for every symbol that has at least one row already. Symbols with no
    rows yet are simply absent from the returned dict — treat that as
    'needs a full backfill'."""
    if not symbols:
        return {}
    query = text(
        """
        select symbol, max(date) as latest_date
        from prices_daily
        where symbol in :symbols
        group by symbol
        """
    ).bindparams(bindparam("symbols", expanding=True))
    with engine.connect() as conn:
        rows = conn.execute(query, {"symbols": symbols}).mappings().all()
    return {row["symbol"]: row["latest_date"] for row in rows}


def fetch_one(yahoo_ticker: str, start: date | None = None) -> pd.DataFrame | None:
    """Fetch OHLCV for one ticker. If `start` is given, requests only
    data from that date forward (incremental refresh); otherwise pulls
    the full HISTORY_PERIOD backfill (first-ever fetch for this symbol,
    or an explicit --full-refetch)."""
    if start is not None:
        df = yf.download(
            yahoo_ticker,
            start=start.isoformat(),
            interval="1d",
            auto_adjust=False,
            progress=False,
        )
    else:
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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full-refetch",
        action="store_true",
        help="Ignore existing prices_daily rows and re-pull the full "
             f"{HISTORY_PERIOD} history for every symbol (use after a "
             "reset, or if you suspect the stored history is bad).",
    )
    args = parser.parse_args()

    engine = get_engine()
    ensure_company_rows(engine)

    symbols = [c["symbol"] for c in UNIVERSE]
    latest_dates = {} if args.full_refetch else get_latest_price_dates(engine, symbols)

    n_full_backfill = 0
    n_incremental = 0
    n_already_current = 0
    n_no_data = 0
    failed = []

    for company in UNIVERSE:
        symbol = company["symbol"]
        ticker = company["yahoo_ticker"]
        latest = latest_dates.get(symbol)

        if latest is None:
            start = None  # full HISTORY_PERIOD backfill
            mode = "full backfill"
        else:
            next_day = latest + timedelta(days=1)
            if next_day > date.today():
                print(f"{symbol}: already up to date as of {latest}, skipping fetch.")
                n_already_current += 1
                continue
            start = next_day
            mode = f"incremental from {start}"

        print(f"Fetching {ticker} ({mode}) ...")
        try:
            df = fetch_one(ticker, start=start)
        except Exception as exc:
            print(f"  FAILED: {exc}")
            failed.append(symbol)
            continue

        if df is None:
            print(f"  No new data returned for {ticker}.")
            n_no_data += 1
            continue

        upsert_prices(engine, symbol, df)
        print(f"  Wrote {len(df)} row(s) for {symbol}.")
        if start is None:
            n_full_backfill += 1
        else:
            n_incremental += 1

        # Be polite to Yahoo's unofficial endpoint — small delay between
        # tickers avoids the throttling that hits fast unauthenticated loops.
        time.sleep(1.5)

    print()
    print("fetch_prices summary")
    print(f"  Universe size:        {len(UNIVERSE)}")
    print(f"  Full backfills:       {n_full_backfill}")
    print(f"  Incremental updates:  {n_incremental}")
    print(f"  Already current:      {n_already_current}")
    print(f"  No data returned:     {n_no_data}")
    print(f"  Failed:               {len(failed)}")
    if failed:
        print(f"    {', '.join(failed)}")


if __name__ == "__main__":
    main()

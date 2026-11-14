"""Business logic for the Research page's Price History section
(Module 3). Reuses `prices_daily` — the same table
ingest/compute_technicals.py already reads to build technical_snapshot —
no new table, no invented OHLC values.
"""
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import text

from db.db import engine
from schemas.technical import PriceBar

DEFAULT_RANGE = "6M"

# Matches the range vocabulary API_CONTRACT.md's Module 5 spec already
# named (`?range=1M|6M|1Y|5Y`), plus 3M/ALL for a slightly finer picker.
_RANGE_DAYS = {
    "1M": 30,
    "3M": 90,
    "6M": 182,
    "1Y": 365,
    "5Y": 1825,
}

_PRICES_QUERY = text(
    """
    select date, open, high, low, close, volume
    from prices_daily
    where symbol = :symbol
      and (:since is null or date >= :since)
    order by date asc
    """
)


def _backfill_symbol_if_needed(symbol: str, range_: str) -> Optional[List[dict]]:
    """If the requested range is '5Y' or 'ALL' and the stored history in
    prices_daily is shorter than 4 years, pull the full 'max' history from
    yfinance, bulk-upsert into prices_daily, and return the formatted bars
    directly so the user gets instant, complete price history."""
    normalized_range = (range_ or "").upper()
    if normalized_range not in ("5Y", "ALL"):
        return None

    sym = symbol.upper()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("select count(*) as cnt, min(date) as min_date from prices_daily where symbol = :sym"),
                {"sym": sym},
            ).mappings().first()

        cnt = row["cnt"] if row else 0
        min_date = row["min_date"] if row else None

        # If already has >= 900 trading days (~3.5+ years) and starts > 4 years ago, DB is already primed
        if cnt >= 900 and min_date and min_date <= date.today() - timedelta(days=365 * 4):
            return None

        import pandas as pd
        import yfinance as yf

        ticker = f"{sym}.NS"
        df = yf.download(ticker, period="max", interval="1d", auto_adjust=False, progress=False)
        if df is None or df.empty:
            return None

        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
        df = df.reset_index().rename(columns={"Date": "date"})
        df["date"] = pd.to_datetime(df["date"]).dt.date
        df = df.dropna(subset=["Open", "High", "Low", "Close", "Volume"])

        tuples = [
            (
                sym,
                r.date,
                float(r.Open),
                float(r.High),
                float(r.Low),
                float(r.Close),
                int(r.Volume) if pd.notna(r.Volume) else 0,
            )
            for r in df.itertuples(index=False)
        ]
        if not tuples:
            return None

        # Bulk upsert in 1 network roundtrip using psycopg2 execute_values
        try:
            raw_conn = engine.raw_connection()
            try:
                from psycopg2.extras import execute_values
                with raw_conn.cursor() as cur:
                    execute_values(
                        cur,
                        """
                        insert into prices_daily (symbol, date, open, high, low, close, volume)
                        values %s
                        on conflict (symbol, date) do update set
                            open = excluded.open,
                            high = excluded.high,
                            low = excluded.low,
                            close = excluded.close,
                            volume = excluded.volume
                        """,
                        tuples,
                        page_size=3000,
                    )
                raw_conn.commit()
            finally:
                raw_conn.close()
        except Exception as exc:
            import logging
            logging.getLogger("stock_finder").warning("Bulk upsert failed, continuing: %s", exc)

        bars = [
            PriceBar(
                date=t[1].isoformat(),
                open=t[2],
                high=t[3],
                low=t[4],
                close=t[5],
                volume=t[6],
            ).model_dump()
            for t in tuples
        ]
        return bars
    except Exception as exc:
        import logging
        logging.getLogger("stock_finder").warning("Price backfill for %s skipped: %s", sym, exc)
        return None


def get_price_history(symbol: str, range_: str = DEFAULT_RANGE) -> List[dict]:
    """GET /company/{symbol}/prices — one query, scoped by an optional
    lookback window. An unrecognized or "ALL" range returns the full
    history for the symbol instead of guessing a window."""
    fresh_bars = _backfill_symbol_if_needed(symbol, range_)

    days: Optional[int] = _RANGE_DAYS.get((range_ or "").upper())
    since = date.today() - timedelta(days=days) if days else None

    if fresh_bars is not None:
        if since is not None:
            since_iso = since.isoformat()
            return [b for b in fresh_bars if b["date"] >= since_iso]
        return fresh_bars

    with engine.connect() as conn:
        rows = conn.execute(_PRICES_QUERY, {"symbol": symbol.upper(), "since": since}).mappings().all()

    return [
        PriceBar(
            date=row["date"].isoformat(),
            open=row["open"] or 0.0,
            high=row["high"] or 0.0,
            low=row["low"] or 0.0,
            close=row["close"] or 0.0,
            volume=row["volume"] or 0,
        ).model_dump()
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Research page's Support & Resistance section (Bloomberg/TIKR redesign)
# ---------------------------------------------------------------------------

_LATEST_OHLC_QUERY = text(
    """
    select high, low, close
    from prices_daily
    where symbol = :symbol
    order by date desc
    limit 1
    """
)

_SNAPSHOT_LEVELS_QUERY = text(
    """
    select vwap, high_52w, low_52w
    from technical_snapshot
    where symbol = :symbol
    """
)


def get_support_resistance(symbol: str) -> dict:
    """GET /company/{symbol} 'supportResistance'. No existing pivot/
    support/resistance calculation exists anywhere in the codebase —
    ingest/compute_technicals.py and this module only write/read RSI,
    moving averages, VWAP, and 52-week high/low — so pivot/S1/S2/R1/R2
    are computed here with the standard floor-trader formula off the
    most recent day's OHLC in `prices_daily` (the same table the Price
    History chart above already reads; no new table). VWAP and 52-week
    high/low are read straight off `technical_snapshot`, not
    recalculated."""
    with engine.connect() as conn:
        ohlc = conn.execute(_LATEST_OHLC_QUERY, {"symbol": symbol.upper()}).mappings().first()
        snap = conn.execute(_SNAPSHOT_LEVELS_QUERY, {"symbol": symbol.upper()}).mappings().first()

    pivot = support1 = support2 = resistance1 = resistance2 = None
    if ohlc and ohlc["high"] is not None and ohlc["low"] is not None and ohlc["close"] is not None:
        high, low, close = float(ohlc["high"]), float(ohlc["low"]), float(ohlc["close"])
        pivot = (high + low + close) / 3
        support1 = 2 * pivot - high
        resistance1 = 2 * pivot - low
        support2 = pivot - (high - low)
        resistance2 = pivot + (high - low)

    return {
        "pivot": pivot,
        "support1": support1,
        "support2": support2,
        "resistance1": resistance1,
        "resistance2": resistance2,
        "vwap": float(snap["vwap"]) if snap and snap["vwap"] is not None else None,
        "high52w": float(snap["high_52w"]) if snap and snap["high_52w"] is not None else None,
        "low52w": float(snap["low_52w"]) if snap and snap["low_52w"] is not None else None,
    }

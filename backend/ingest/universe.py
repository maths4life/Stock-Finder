"""The tracked universe of companies.

Milestone 5: this module used to be a hardcoded Python list of 8 dev
companies. It is now a thin loader over a structured external dataset
— the CSV is the source of truth, this file just parses it into the
same shape the ingest scripts already expect.

Module 8 (Expand Universe): default universe grew from
`data/universe_top100.csv` (~100 companies, NIFTY 50 + Next 50) to
`data/universe_nifty500.csv` (498 companies — see that file's
provenance note below). Every ingest script (fetch_prices,
fetch_fundamentals, fetch_financial_statements, fetch_shareholding,
compute_technicals, compute_scores) only ever calls `load_universe()`
or imports `UNIVERSE`, so none of them needed to change for this
expansion — this was the entire point of routing everything through
this module rather than importing a list directly. Scaling further
later means replacing/extending the CSV (or pointing UNIVERSE_CSV_PATH
elsewhere) — no ingest script code changes required, per the brief's
"future expansion should require changing only one configuration
value."

Two independent config knobs, layered:
  UNIVERSE_CSV_PATH  -- which file to load (default: universe_nifty500.csv)
  UNIVERSE_SIZE      -- optional int; if set, keep only the first N rows
                        *after* loading. Since the CSV is ordered by
                        index priority (NIFTY50 block, then
                        NIFTYNEXT50, then NIFTYMIDCAP150, then
                        NIFTYSMALLCAP250 -- see that file's header),
                        UNIVERSE_SIZE=100 reproduces the old top-100
                        universe from the new file without needing a
                        separate CSV, and UNIVERSE_SIZE=50 gives just
                        NIFTY 50. Mainly useful for a fast local
                        smoke-test ingestion run; production should
                        leave this unset and use the full file.

`data/universe_nifty500.csv` provenance and honesty note: built from a
live market-cap-ranked NSE listing (498 companies -- 2 near-duplicate
listings of already-included companies were excluded, see that file's
own header comment) fetched at the time this module was built.
`index_membership` (NIFTY50 / NIFTYNEXT50 / NIFTYMIDCAP150 /
NIFTYSMALLCAP250) is assigned by total-market-cap rank as an
**approximation** of the official free-float-weighted NSE indices, not
a verified read of NSE's actual current constituent lists for the
middle two -- the official indices use 6-month-average free-float
market cap with semi-annual rebalancing (see NSE's own eligibility
criteria), which will disagree with a rank-by-today's-total-market-cap
snapshot at the margins between tiers. NIFTY 50 and NIFTY Next 50
(ranks 1-100) are large, stable, well-known blue-chip companies where
this approximation is very unlikely to be wrong about *membership*
(these companies are unambiguously large/liquid); the
Midcap150/Smallcap250 boundary (rank ~250) is where an official
rebalance is most likely to disagree with this snapshot. `sector` is
pre-filled from the previously-curated 100-company file where a symbol
matches; the rest are blank and get filled in by
ingest/fetch_fundamentals.py's metadata enrichment (Yahoo's own sector/
industry classification) on first ingestion run, rather than guessed
here.

CSV columns:
    symbol            -> internal symbol, matches companies.symbol in the DB
    yahoo_ticker      -> what yfinance expects (.NS for NSE, .BO for BSE)
    exchange          -> 'NSE' or 'BSE'
    name              -> display name
    sector            -> companies.sector (NSE's broad sector classification)
    index_membership  -> 'NIFTY50' | 'NIFTYNEXT50' | ... (free-text; not
                         enforced by an enum so future universes — full
                         NSE 500, custom watchlists, etc — don't need a
                         code change here, only new values in the file)
    is_active         -> 'true'/'false'. Rows can be marked inactive
                         (e.g. a company delisted or dropped from the
                         index) without deleting the row, so historical
                         price/fundamentals data tied to it via FK is
                         never orphaned. See db/schema.sql's
                         companies.is_active and ingest/reset_market_data.py.
"""
import csv
import os
from pathlib import Path
from typing import List, Optional, TypedDict

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_UNIVERSE_CSV = DATA_DIR / "universe_nifty500.csv"
UNIVERSE_CSV_PATH = Path(os.environ.get("UNIVERSE_CSV_PATH", DEFAULT_UNIVERSE_CSV))
UNIVERSE_SIZE = int(os.environ["UNIVERSE_SIZE"]) if os.environ.get("UNIVERSE_SIZE") else None

REQUIRED_COLUMNS = {"symbol", "yahoo_ticker", "exchange", "name", "sector"}


class UniverseRow(TypedDict):
    symbol: str
    yahoo_ticker: str
    exchange: str
    name: str
    sector: str
    index_membership: str
    is_active: bool


def _parse_bool(raw: str) -> bool:
    return str(raw).strip().lower() in ("true", "1", "yes", "y")


def load_universe(
    csv_path: Path = UNIVERSE_CSV_PATH, active_only: bool = True, size: Optional[int] = UNIVERSE_SIZE
) -> List[UniverseRow]:
    """Load the tracked universe from the CSV source of truth.

    active_only=True (the default, and what every ingest script should
    use) skips rows marked is_active=false — e.g. a company that left the
    index. Pass active_only=False if you specifically need every row the
    file has ever contained (not currently needed anywhere, kept for
    completeness/debugging).

    size caps the result to the first N rows *after* filtering
    (defaults to the UNIVERSE_SIZE env var, so this needs no code change
    to use — just set the env var). Since the CSV is index-priority
    ordered, a smaller size is a smaller, still-sensible universe
    (NIFTY50 first), not an arbitrary truncation.

    Raises FileNotFoundError with a clear message if the CSV is missing,
    and ValueError if a row is missing a required column — fail loudly
    here rather than silently ingesting a partial/malformed universe.
    """
    if not csv_path.is_file():
        raise FileNotFoundError(
            f"Universe file not found at {csv_path}. Set UNIVERSE_CSV_PATH "
            f"or restore {DEFAULT_UNIVERSE_CSV.name}."
        )

    rows: List[UniverseRow] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing_cols = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing_cols:
            raise ValueError(f"{csv_path} is missing required column(s): {sorted(missing_cols)}")

        seen_symbols = set()
        for i, raw in enumerate(reader, start=2):  # header is line 1
            symbol = (raw.get("symbol") or "").strip().upper()
            if not symbol:
                raise ValueError(f"{csv_path}:{i}: blank symbol")
            if symbol in seen_symbols:
                raise ValueError(f"{csv_path}:{i}: duplicate symbol {symbol}")
            seen_symbols.add(symbol)

            row: UniverseRow = {
                "symbol": symbol,
                "yahoo_ticker": (raw.get("yahoo_ticker") or "").strip(),
                "exchange": (raw.get("exchange") or "NSE").strip().upper(),
                "name": (raw.get("name") or "").strip(),
                "sector": (raw.get("sector") or "").strip(),
                "index_membership": (raw.get("index_membership") or "").strip(),
                "is_active": _parse_bool(raw.get("is_active", "true")),
            }
            if not row["yahoo_ticker"] or not row["name"]:
                raise ValueError(f"{csv_path}:{i}: {symbol} is missing yahoo_ticker or name")

            if active_only and not row["is_active"]:
                continue
            rows.append(row)

    if not rows:
        raise ValueError(f"{csv_path} produced zero active rows — refusing to run against an empty universe.")

    if size is not None:
        if size <= 0:
            raise ValueError(f"UNIVERSE_SIZE must be positive, got {size}")
        rows = rows[:size]

    return rows


# Backwards-compatible module-level constant. A handful of older call
# sites (and any ad-hoc scripts a developer may have written against the
# old hardcoded list) imported `UNIVERSE` directly rather than calling a
# function. Loaded once at import time -- fine even at ~500 rows (a few
# hundred KB of CSV, parsed once); if this module is ever imported
# somewhere that shouldn't fail on a missing/bad CSV (e.g. at FastAPI app
# startup), prefer calling load_universe() directly instead of relying on
# this constant.
UNIVERSE: List[UniverseRow] = load_universe()


if __name__ == "__main__":
    u = load_universe()
    print(f"Loaded {len(u)} active companies from {UNIVERSE_CSV_PATH}")
    by_index: dict = {}
    for row in u:
        by_index.setdefault(row["index_membership"] or "(none)", []).append(row["symbol"])
    for idx, symbols in by_index.items():
        print(f"  {idx}: {len(symbols)}")

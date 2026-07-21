"""The tracked universe of companies.

Milestone 5: this module used to be a hardcoded Python list of 8 dev
companies. It is now a thin loader over a structured external dataset
(`data/universe_top100.csv`) — the CSV is the source of truth, this file
just parses it into the same shape the ingest scripts already expect.

Why a CSV and not a DB table: which companies are "in scope" is an
infrequent, human, auditable decision (index rebalances happen twice a
year, per NSE's own semi-annual review calendar) — not something that
needs live, in-app mutation. A file under version control gives free
diff/review history for that kind of change; a table would need its own
admin workflow to get the same auditability, which is explicitly out of
scope for this milestone (see md/CURRENT_MILESTONE.md).

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

To scale from ~100 to the full NSE universe later: replace or extend this
CSV (or point UNIVERSE_CSV_PATH at a differently-generated file) — nothing
in fetch_prices.py / compute_technicals.py / compute_scores.py needs to
change, since they only ever call load_universe().
"""
import csv
import os
from pathlib import Path
from typing import List, TypedDict

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
UNIVERSE_CSV_PATH = Path(os.environ.get("UNIVERSE_CSV_PATH", DATA_DIR / "universe_top100.csv"))

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


def load_universe(csv_path: Path = UNIVERSE_CSV_PATH, active_only: bool = True) -> List[UniverseRow]:
    """Load the tracked universe from the CSV source of truth.

    active_only=True (the default, and what every ingest script should
    use) skips rows marked is_active=false — e.g. a company that left the
    index. Pass active_only=False if you specifically need every row the
    file has ever contained (not currently needed anywhere, kept for
    completeness/debugging).

    Raises FileNotFoundError with a clear message if the CSV is missing,
    and ValueError if a row is missing a required column — fail loudly
    here rather than silently ingesting a partial/malformed universe.
    """
    if not csv_path.is_file():
        raise FileNotFoundError(
            f"Universe file not found at {csv_path}. Set UNIVERSE_CSV_PATH "
            "or restore data/universe_top100.csv."
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

    return rows


# Backwards-compatible module-level constant. A handful of older call
# sites (and any ad-hoc scripts a developer may have written against the
# old hardcoded list) imported `UNIVERSE` directly rather than calling a
# function. Loaded once at import time — fine for a ~100-row CSV; if this
# module is ever imported somewhere that shouldn't fail on a missing/bad
# CSV (e.g. at FastAPI app startup), prefer calling load_universe()
# directly instead of relying on this constant.
UNIVERSE: List[UniverseRow] = load_universe()


if __name__ == "__main__":
    u = load_universe()
    print(f"Loaded {len(u)} active companies from {UNIVERSE_CSV_PATH}")
    by_index: dict = {}
    for row in u:
        by_index.setdefault(row["index_membership"] or "(none)", []).append(row["symbol"])
    for idx, symbols in by_index.items():
        print(f"  {idx}: {len(symbols)}")

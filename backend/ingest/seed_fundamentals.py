"""LEGACY / OPTIONAL path. The default way to populate fundamentals is now
`ingest/fetch_fundamentals.py`, which pulls live from yfinance and needs
no external dataset — run that instead unless you specifically have the
Kaggle export below and want its (frozen, one-time) numbers instead. This
script cannot run at all on a fresh checkout of this project: the
dataset is not bundled here and was never checked in (see
`DATA_STRATEGY.md` §4 and `TECHNICAL_DEBT.md` TD-001).

One-time (or occasional) seed of fundamentals + shareholding data from
the free Kaggle dataset:

    "Detailed Financials Data Of 4492 NSE & BSE Company"
    https://www.kaggle.com/datasets/sameerprogrammer/detailed-financial-data-of-4456-nse-and-bse-company

REAL DATASET STRUCTURE (confirmed against an actual download — the
dataset's own listing page implies a flat master CSV, which is WRONG):

    <data_dir>/
        List-Of-All-Companies.csv                     -- just a bare index
                                                           of company names,
                                                           not used here
        <Company Name>/
            <Company Name>_Basic_Info.csv              -- 1 row, latest
                                                           snapshot (PE, ROE,
                                                           ROCE, market cap,
                                                           growth rates, ...)
            Ratios.csv                                 -- wide: metric rows
                                                           x year columns
                                                           (Debtor Days,
                                                           ROCE %, ...)
            Yearly_Profit_Loss.csv                     -- wide: metric rows
                                                           x "Mon YYYY" /
                                                           "TTM" columns
            Quarterly_Profit_Loss.csv                  -- wide: metric rows
                                                           x ISO-date columns
            Yearly_Balance_Sheet.csv                   -- wide: metric rows
                                                           x ISO-date columns
            Yearly_Cash_flow.csv                       -- wide, NOT ingested
                                                           (no capex line, so
                                                           we can't derive a
                                                           trustworthy FCF
                                                           number from it)
            Yearly_Shareholding_Pattern.csv            -- wide: holder-
                                                           category rows x
                                                           ISO-date columns
            Quarterly_Shareholding_Pattern.csv         -- same, quarterly

    ~193 of the 4492 company folders have neither shareholding CSV; every
    folder has Basic_Info, Ratios, and both Profit_Loss files.

There is NO flat file anywhere with columns like `ROE`, `Market Cap`,
`Promoters`, etc. across all companies — every metric lives inside a
per-company "wide" CSV where the FIRST COLUMN is a metric/category label and
the remaining columns are one per reporting period. This script pivots each
of those wide files into (period -> {label: value}) dicts and merges them.

Known gaps / approximations (documented so nobody mistakes these for exact
source figures later):
  - `ebitda_margin_pct` is filled from the source's "OPM %" (operating
    margin) / "Financing Margin %" for banks & NBFCs. It is NOT a true
    EBITDA margin -- the dataset doesn't provide D&A split out finely enough
    to compute one. Close enough for a first-pass screener, not for precise
    modeling.
  - `debt_to_equity` is computed as Borrowings / (Equity Capital + Reserves)
    from the yearly balance sheet -- a standard approximation, but not
    identical to a textbook D/E that also nets off intangibles etc.
  - `free_cash_flow_cr` is left NULL. Yearly_Cash_flow.csv has "Cash from
    Operating Activity" but no separate capex line, so operating cash flow
    != free cash flow and we don't fabricate the difference.
  - `current_ratio` and `peg` are left NULL -- not present in any source
    file here without inventing a formula from partial data.
  - `pledge_pct` (shareholding) is left NULL, `Government` and `Others`
    shareholding categories are read but have no column in
    shareholding_pattern and are skipped -- matches project notes that
    pledge/full category breakdowns come later from the NSE scraper.
  - Roughly half the companies (2257 / 4492 in the version this was tested
    against) have no NSE code, only a BSE code. Symbol falls back to the
    BSE code and yahoo_ticker to `<code>.BO` in that case.

Usage:
    python -m ingest.seed_fundamentals /path/to/extracted/kaggle/dataset
    python -m ingest.seed_fundamentals /path/to/dataset --limit 50   # smoke test
    python -m ingest.seed_fundamentals /path/to/dataset --dry-run    # parse only, no DB writes
"""
import argparse
import csv
import glob
import os
import sys
from datetime import datetime

from sqlalchemy import text

from ingest.db import get_engine

BASIC_INFO_GLOB = "*_Basic_Info.csv"

# Label synonyms: non-financial companies use one set, banks/NBFCs use another.
REVENUE_LABELS = ["Sales", "Revenue"]
MARGIN_LABELS = ["OPM %", "Financing Margin %"]
NET_PROFIT_LABELS = ["Net Profit"]
EPS_LABELS = ["EPS in Rs"]
ROCE_LABELS = ["ROCE %"]
ROE_LABELS = ["ROE %"]
BORROWINGS_LABELS = ["Borrowings"]
EQUITY_CAPITAL_LABELS = ["Equity Capital"]
RESERVES_LABELS = ["Reserves"]

BATCH_SIZE = 150  # companies per DB flush


# ------------------------------------------------------------------
# Low-level parsing helpers
# ------------------------------------------------------------------

def clean_num(val):
    """Parse a source cell into a float, or None if blank/unparseable."""
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none", "-", "na", "n/a"):
        return None
    s = s.replace(",", "").rstrip("%").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_period_header(col: str) -> str:
    """Normalize a wide-CSV column header into a stable period label.

    Handles the three header styles seen in this dataset:
      'TTM'          -> 'TTM'                (Yearly_Profit_Loss)
      'Mar 2012'     -> '2012-03-01'         (Yearly_Profit_Loss)
      '2012-03-01'   -> '2012-03-01'         (Ratios, Balance Sheet,
                                               Shareholding, Quarterly P&L)
    Unrecognized headers are passed through unchanged rather than dropped,
    so nothing silently disappears.
    """
    col = col.strip()
    if col.upper() == "TTM":
        return "TTM"
    try:
        d = datetime.strptime(col, "%b %Y")
        return d.strftime("%Y-%m-01")
    except ValueError:
        pass
    try:
        d = datetime.strptime(col, "%Y-%m-%d")
        return d.strftime("%Y-%m-%d")
    except ValueError:
        pass
    return col


def period_to_date(period: str):
    try:
        return datetime.strptime(period, "%Y-%m-%d").date()
    except ValueError:
        return None


def read_wide_csv(path: str) -> dict:
    """Read a 'metric rows x period columns' CSV into
    {period_label: {metric_label: float_or_None}}.
    Returns {} if the file is missing or empty.
    """
    if not os.path.isfile(path):
        return {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f))
    if not rows:
        return {}
    header = rows[0]
    periods = [parse_period_header(c) for c in header[1:]]
    out = {p: {} for p in periods}
    for row in rows[1:]:
        if not row:
            continue
        label = row[0].strip()
        for i, raw in enumerate(row[1:]):
            if i >= len(periods):
                break
            out[periods[i]][label] = clean_num(raw)
    return out


def read_basic_info(path: str) -> dict:
    """Read the single-row Basic_Info.csv into a raw dict, or {} if
    missing."""
    if not os.path.isfile(path):
        return {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return {}
    return rows[0]


def first_present(d: dict, labels: list):
    for label in labels:
        if label in d and d[label] is not None:
            return d[label]
    return None


# ------------------------------------------------------------------
# Per-company extraction
# ------------------------------------------------------------------

def build_company_record(company_dir: str, folder_name: str):
    """Returns (company_row, financials_rows, shareholding_rows) for one
    company folder, or None if the company can't be identified at all
    (no NSE and no BSE code)."""

    basic_files = glob.glob(os.path.join(company_dir, BASIC_INFO_GLOB))
    basic = read_basic_info(basic_files[0]) if basic_files else {}

    nse = (basic.get("NSE") or "").strip()
    bse = (basic.get("BSE") or "").strip()
    if not nse and not bse:
        return None  # can't key this company to anything usable

    if nse:
        symbol = nse.upper()
        yahoo_ticker = f"{symbol}.NS"
    else:
        symbol = bse
        yahoo_ticker = f"{bse}.BO"

    name = (basic.get("Company_name") or "").strip() or folder_name
    sector = (basic.get("Sector") or "").strip() or None

    company_row = {
        "symbol": symbol,
        "yahoo_ticker": yahoo_ticker,
        "name": name,
        "sector": sector,
    }

    financials_rows = []
    shareholding_rows = []

    # ---- 'latest' snapshot row, sourced entirely from Basic_Info.csv ----
    if basic:
        current_price = clean_num(basic.get("Current Price"))
        book_value = clean_num(basic.get("Book Value"))
        pb = (
            round(current_price / book_value, 4)
            if current_price and book_value
            else None
        )
        financials_rows.append({
            "symbol": symbol,
            "quarter": "latest",
            "fiscal_year_end": None,
            "revenue_cr": None,
            "net_profit_cr": None,
            "ebitda_margin_pct": None,
            "eps": clean_num(basic.get("EPS")),
            "roe_pct": clean_num(basic.get("ROE")),
            "roce_pct": clean_num(basic.get("ROCE")),
            "debt_to_equity": None,
            "current_ratio": None,
            "free_cash_flow_cr": None,
            "pe": clean_num(basic.get("Stock P/E")),
            "pb": pb,
            "peg": None,
            "revenue_growth_pct": clean_num(basic.get("Sales growth")),
            "profit_growth_pct": clean_num(basic.get("Profit growth")),
            "dividend_yield_pct": clean_num(basic.get("Dividend Yield")),
            "market_cap_cr": clean_num(basic.get("Market Cap")),
            "book_value": book_value,
        })

    # ---- merge yearly + quarterly P&L, yearly balance sheet, ratios ----
    pl_yearly = read_wide_csv(os.path.join(company_dir, "Yearly_Profit_Loss.csv"))
    pl_quarterly = read_wide_csv(os.path.join(company_dir, "Quarterly_Profit_Loss.csv"))
    balance = read_wide_csv(os.path.join(company_dir, "Yearly_Balance_Sheet.csv"))
    ratios = read_wide_csv(os.path.join(company_dir, "Ratios.csv"))

    all_periods = set(pl_yearly) | set(pl_quarterly) | set(balance) | set(ratios)
    for period in all_periods:
        pl = pl_yearly.get(period) or pl_quarterly.get(period) or {}
        bs = balance.get(period, {})
        rt = ratios.get(period, {})
        if not pl and not bs and not rt:
            continue

        revenue = first_present(pl, REVENUE_LABELS)
        net_profit = first_present(pl, NET_PROFIT_LABELS)
        margin = first_present(pl, MARGIN_LABELS)
        eps = first_present(pl, EPS_LABELS)
        roce = first_present(rt, ROCE_LABELS)
        roe = first_present(rt, ROE_LABELS)

        borrowings = first_present(bs, BORROWINGS_LABELS)
        equity_cap = first_present(bs, EQUITY_CAPITAL_LABELS)
        reserves = first_present(bs, RESERVES_LABELS)
        debt_to_equity = None
        if borrowings is not None and equity_cap is not None and reserves is not None:
            denom = equity_cap + reserves
            if denom:
                debt_to_equity = round(borrowings / denom, 4)

        if all(v is None for v in (revenue, net_profit, margin, eps, roce, roe, debt_to_equity)):
            continue

        financials_rows.append({
            "symbol": symbol,
            "quarter": period,
            "fiscal_year_end": period_to_date(period),
            "revenue_cr": revenue,
            "net_profit_cr": net_profit,
            "ebitda_margin_pct": margin,
            "eps": eps,
            "roe_pct": roe,
            "roce_pct": roce,
            "debt_to_equity": debt_to_equity,
            "current_ratio": None,
            "free_cash_flow_cr": None,
            "pe": None,
            "pb": None,
            "peg": None,
            "revenue_growth_pct": None,
            "profit_growth_pct": None,
            "dividend_yield_pct": None,
            "market_cap_cr": None,
            "book_value": None,
        })

    # ---- shareholding: ingest yearly first, then quarterly (quarterly
    #      wins on overlapping exact dates, since it's more likely to be
    #      the freshest cut for that date) ----
    sh_yearly = read_wide_csv(os.path.join(company_dir, "Yearly_Shareholding_Pattern.csv"))
    sh_quarterly = read_wide_csv(os.path.join(company_dir, "Quarterly_Shareholding_Pattern.csv"))
    for source in (sh_yearly, sh_quarterly):
        for period, row in source.items():
            promoter = row.get("Promoters")
            fii = row.get("FIIs")
            dii = row.get("DIIs")
            public = row.get("Public")
            if all(v is None for v in (promoter, fii, dii, public)):
                continue
            shareholding_rows.append({
                "symbol": symbol,
                "quarter": period,
                "promoter_pct": promoter,
                "fii_pct": fii,
                "dii_pct": dii,
                "public_pct": public,
            })

    return company_row, financials_rows, shareholding_rows


# ------------------------------------------------------------------
# Bulk DB writes
# ------------------------------------------------------------------

UPSERT_COMPANY = text("""
    insert into companies (symbol, yahoo_ticker, exchange, name, sector)
    values (:symbol, :yahoo_ticker, 'NSE', :name, :sector)
    on conflict (symbol) do update set
        name = excluded.name,
        sector = coalesce(excluded.sector, companies.sector)
""")

UPSERT_FINANCIALS = text("""
    insert into financials_quarterly (
        symbol, quarter, fiscal_year_end, revenue_cr, net_profit_cr,
        ebitda_margin_pct, eps, roe_pct, roce_pct, debt_to_equity,
        current_ratio, free_cash_flow_cr, pe, pb, peg,
        revenue_growth_pct, profit_growth_pct, dividend_yield_pct,
        market_cap_cr, book_value, source
    ) values (
        :symbol, :quarter, :fiscal_year_end, :revenue_cr, :net_profit_cr,
        :ebitda_margin_pct, :eps, :roe_pct, :roce_pct, :debt_to_equity,
        :current_ratio, :free_cash_flow_cr, :pe, :pb, :peg,
        :revenue_growth_pct, :profit_growth_pct, :dividend_yield_pct,
        :market_cap_cr, :book_value, 'kaggle_seed'
    )
    on conflict (symbol, quarter) do update set
        fiscal_year_end = excluded.fiscal_year_end,
        revenue_cr = excluded.revenue_cr,
        net_profit_cr = excluded.net_profit_cr,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        eps = excluded.eps,
        roe_pct = excluded.roe_pct,
        roce_pct = excluded.roce_pct,
        debt_to_equity = excluded.debt_to_equity,
        current_ratio = excluded.current_ratio,
        free_cash_flow_cr = excluded.free_cash_flow_cr,
        pe = excluded.pe,
        pb = excluded.pb,
        peg = excluded.peg,
        revenue_growth_pct = excluded.revenue_growth_pct,
        profit_growth_pct = excluded.profit_growth_pct,
        dividend_yield_pct = excluded.dividend_yield_pct,
        market_cap_cr = excluded.market_cap_cr,
        book_value = excluded.book_value,
        updated_at = now()
""")

UPSERT_SHAREHOLDING = text("""
    insert into shareholding_pattern (
        symbol, quarter, promoter_pct, fii_pct, dii_pct, public_pct, source
    ) values (
        :symbol, :quarter, :promoter_pct, :fii_pct, :dii_pct, :public_pct, 'kaggle_seed'
    )
    on conflict (symbol, quarter) do update set
        promoter_pct = excluded.promoter_pct,
        fii_pct = excluded.fii_pct,
        dii_pct = excluded.dii_pct,
        public_pct = excluded.public_pct,
        updated_at = now()
""")


def flush_batch(engine, companies, financials, shareholding):
    if not companies:
        return
    with engine.begin() as conn:
        conn.execute(UPSERT_COMPANY, companies)
        if financials:
            conn.execute(UPSERT_FINANCIALS, financials)
        if shareholding:
            conn.execute(UPSERT_SHAREHOLDING, shareholding)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def iter_company_dirs(data_dir: str):
    for entry in sorted(os.listdir(data_dir)):
        full = os.path.join(data_dir, entry)
        if os.path.isdir(full):
            yield full, entry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", help="Path to the extracted Kaggle dataset "
                         "(the folder that directly contains one subfolder per company)")
    parser.add_argument("--limit", type=int, default=None,
                         help="Only process the first N company folders (smoke test)")
    parser.add_argument("--dry-run", action="store_true",
                         help="Parse everything but skip all DB writes")
    args = parser.parse_args()

    if not os.path.isdir(args.data_dir):
        print(f"Not a directory: {args.data_dir}")
        sys.exit(1)

    engine = None if args.dry_run else get_engine()

    n_companies = 0
    n_skipped_no_code = 0
    n_financial_rows = 0
    n_shareholding_rows = 0
    errors = []

    batch_companies, batch_financials, batch_shareholding = [], [], []

    for company_dir, folder_name in iter_company_dirs(args.data_dir):
        if args.limit and n_companies >= args.limit:
            break
        try:
            result = build_company_record(company_dir, folder_name)
        except Exception as e:
            errors.append(f"{folder_name}: {e}")
            continue

        if result is None:
            n_skipped_no_code += 1
            continue

        company_row, financials_rows, shareholding_rows = result
        n_companies += 1
        n_financial_rows += len(financials_rows)
        n_shareholding_rows += len(shareholding_rows)

        batch_companies.append(company_row)
        batch_financials.extend(financials_rows)
        batch_shareholding.extend(shareholding_rows)

        if len(batch_companies) >= BATCH_SIZE:
            if engine:
                flush_batch(engine, batch_companies, batch_financials, batch_shareholding)
            print(f"  ...{n_companies} companies processed", flush=True)
            batch_companies, batch_financials, batch_shareholding = [], [], []

    if engine and batch_companies:
        flush_batch(engine, batch_companies, batch_financials, batch_shareholding)

    print()
    print(f"Companies ingested:        {n_companies}")
    print(f"Skipped (no NSE/BSE code): {n_skipped_no_code}")
    print(f"Financials rows:           {n_financial_rows}")
    print(f"Shareholding rows:         {n_shareholding_rows}")
    if args.dry_run:
        print("(dry run -- nothing was written to the DB)")
    if errors:
        print(f"\n{len(errors)} companies raised errors and were skipped:")
        for e in errors[:20]:
            print(f"  - {e}")
        if len(errors) > 20:
            print(f"  ...and {len(errors) - 20} more")


if __name__ == "__main__":
    main()

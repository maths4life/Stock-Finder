"""Fundamentals ingestion — live, free, and refreshable.

Replaces the old `ingest/seed_fundamentals.py` Kaggle-CSV path as the
default way to populate `financials_quarterly` (and, best-effort,
`shareholding_pattern`). The Kaggle dataset ("Detailed Financials Data
Of 4492 NSE & BSE Company") is no longer bundled with this project, so
that script cannot run against a fresh checkout — see `DATA_STRATEGY.md`
§4 option 2, now implemented.

Source: `yfinance`'s `Ticker.info` / `Ticker.fast_info`, the same free,
unofficial Yahoo Finance endpoint `ingest/fetch_prices.py` already
depends on for prices. This is a real change of data source (Yahoo's
own computed ratios), not a re-hosting of the Kaggle file — expect
occasional differences from the old `kaggle_seed` numbers if you're
comparing against a database that still has old rows.

What this DOES give you, per symbol, written as a single `quarter =
'latest'` row (a point-in-time snapshot, same convention the Kaggle
seed used for its own 'latest' row):
    pe, pb, eps, book_value, market_cap_cr, peg, dividend_yield_pct,
    roe_pct, debt_to_equity, current_ratio, revenue_growth_pct,
    profit_growth_pct, revenue_cr, net_profit_cr, ebitda_margin_pct,
    free_cash_flow_cr

What it approximates, and how:
  - `roce_pct` is NOT provided by `Ticker.info` at all. This script
    computes a best-effort ROCE from `Ticker.financials` (EBIT, most
    recent annual column) over `Ticker.balance_sheet` (Total Assets -
    Current Liabilities, most recent annual column). This is a
    standard ROCE formula, but it depends on Yahoo's statement line
    items being present and named consistently, which is NOT
    guaranteed for every NSE-listed company — falls back to NULL,
    same "don't fabricate" rule the old script followed, rather than
    guessing.
  - `debt_to_equity`: yfinance's `debtToEquity` is expressed as a
    percentage (e.g. 41.3 meaning a 0.413 ratio), not a raw ratio.
    Divided by 100 here so it's directly comparable to the
    Debt/Equity thresholds `analysis/rules/fundamental.py` already
    uses (e.g. ">1.5 is high leverage").
  - `dividend_yield_pct`: yfinance has changed the units of this field
    across versions (fraction vs. already-a-percent). Handled
    defensively — see `_normalize_pct_field()`.

What this does NOT give you (left NULL, not invented):
  - Multi-quarter history. Yahoo's `info` is a current snapshot, not a
    quarterly time series — same single-row limitation the Kaggle
    seed's 'latest' row had. `financials_quarterly` remains a time
    series table in principle (see `TECHNICAL_DEBT.md` TD-010); this
    script only ever writes/updates the 'latest' row for each symbol.
  - `pledge_pct`, and a true promoter/FII/DII/public shareholding
    split. `Ticker.info`'s `heldPercentInsiders` /
    `heldPercentInstitutions` are NOT the same thing as NSE's
    promoter/FII/DII categories (insider holding in particular means
    something different for a US-style filing than "promoter" means
    for an Indian company). Written to `shareholding_pattern` anyway,
    with `source = 'yfinance_approx'` (never `'kaggle_seed'` or a bare
    `'yfinance'`) specifically so nothing downstream mistakes it for a
    real NSE shareholding disclosure. See `DATA_STRATEGY.md` §4 — a
    real promoter/FII/DII/pledge% feed still needs NSE's own filings.

Usage:
    python -m ingest.fetch_fundamentals
    python -m ingest.fetch_fundamentals --limit 10        # smoke test
    python -m ingest.fetch_fundamentals --dry-run          # fetch + parse only, no DB writes
    python -m ingest.fetch_fundamentals --skip-shareholding # financials only
"""
import argparse
import time

import yfinance as yf
from sqlalchemy import text

from ingest.db import get_engine
from ingest.universe import UNIVERSE

CR = 1e7  # 1 crore = 10,000,000 — Yahoo reports absolute INR, schema wants crores

# Be polite to Yahoo's unofficial endpoint, same rationale/value as
# ingest/fetch_prices.py's delay between tickers.
REQUEST_DELAY_SECONDS = 1.5


# ------------------------------------------------------------------
# Low-level helpers
# ------------------------------------------------------------------

def _num(v):
    """Coerce a yfinance info value to float, or None if missing/NaN."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _to_cr(v):
    v = _num(v)
    return round(v / CR, 4) if v is not None else None


def _normalize_pct_field(v):
    """yfinance has shipped both 'fraction' (0.025) and 'already a
    percent' (2.5) representations for percentage-like fields
    (dividendYield in particular changed units between releases). A
    fraction for any real-world ROE/growth/yield figure is < 1 in
    magnitude far more often than a genuine >=100% figure is
    plausible, so: values with abs() < 1 are treated as fractions and
    scaled to a percent; anything >= 1 is assumed to already be a
    percent and passed through unchanged."""
    v = _num(v)
    if v is None:
        return None
    return round(v * 100, 4) if abs(v) < 1 else round(v, 4)


def fetch_info(yahoo_ticker: str) -> dict:
    """Fetch the `.info` snapshot for one ticker. Raises on hard
    failure (network, bad ticker) — caller decides how to handle."""
    t = yf.Ticker(yahoo_ticker)
    info = t.info or {}
    if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
        # yfinance sometimes returns a near-empty dict (e.g. {"trailingPegRatio": None})
        # for a delisted/renamed/invalid ticker instead of raising.
        raise ValueError(f"empty/invalid info payload for {yahoo_ticker}")
    return info


def compute_roce(ticker: yf.Ticker) -> float | None:
    """Best-effort ROCE = EBIT / (Total Assets - Current Liabilities),
    most recent annual column of each statement. Returns None on any
    missing line item, empty statement, or shape mismatch rather than
    guessing — Yahoo's line-item naming isn't guaranteed consistent
    across companies (banks/NBFCs in particular often lack a clean
    'Current Liabilities' line, which is expected and fine to skip)."""
    try:
        fin = ticker.financials
        bs = ticker.balance_sheet
        if fin is None or bs is None or fin.empty or bs.empty:
            return None

        ebit = None
        for label in ("EBIT", "Operating Income", "OperatingIncome"):
            if label in fin.index:
                ebit = _num(fin.loc[label].iloc[0])
                if ebit is not None:
                    break
        if ebit is None:
            return None

        total_assets = None
        for label in ("Total Assets", "TotalAssets"):
            if label in bs.index:
                total_assets = _num(bs.loc[label].iloc[0])
                break
        current_liab = None
        for label in ("Current Liabilities", "CurrentLiabilities", "Total Current Liabilities"):
            if label in bs.index:
                current_liab = _num(bs.loc[label].iloc[0])
                break
        if total_assets is None or current_liab is None:
            return None

        capital_employed = total_assets - current_liab
        if not capital_employed:
            return None
        return round(ebit / capital_employed * 100, 4)
    except Exception:
        # Any parsing surprise here should degrade to "no ROCE", never
        # crash the whole company's ingestion.
        return None


# ------------------------------------------------------------------
# Row builders
# ------------------------------------------------------------------

def build_financials_row(symbol: str, info: dict, roce_pct) -> dict:
    pe = _num(info.get("trailingPE")) or _num(info.get("forwardPE"))
    revenue_cr = _to_cr(info.get("totalRevenue"))
    net_profit_cr = _to_cr(info.get("netIncomeToCommon"))
    fcf_cr = _to_cr(info.get("freeCashflow"))
    market_cap_cr = _to_cr(info.get("marketCap"))

    return {
        "symbol": symbol,
        "quarter": "latest",
        "fiscal_year_end": None,
        "revenue_cr": revenue_cr,
        "net_profit_cr": net_profit_cr,
        "ebitda_margin_pct": _normalize_pct_field(info.get("ebitdaMargins")),
        "eps": _num(info.get("trailingEps")),
        "roe_pct": _normalize_pct_field(info.get("returnOnEquity")),
        "roce_pct": roce_pct,
        "debt_to_equity": round(_num(info.get("debtToEquity")) / 100, 4) if _num(info.get("debtToEquity")) is not None else None,
        "current_ratio": _num(info.get("currentRatio")),
        "free_cash_flow_cr": fcf_cr,
        "pe": round(pe, 4) if pe is not None else None,
        "pb": _num(info.get("priceToBook")),
        "peg": _num(info.get("pegRatio") or info.get("trailingPegRatio")),
        "revenue_growth_pct": _normalize_pct_field(info.get("revenueGrowth")),
        "profit_growth_pct": _normalize_pct_field(
            info.get("earningsGrowth") if info.get("earningsGrowth") is not None else info.get("earningsQuarterlyGrowth")
        ),
        "dividend_yield_pct": _normalize_pct_field(info.get("dividendYield")),
        "market_cap_cr": market_cap_cr,
        "book_value": _num(info.get("bookValue")),
    }


def build_shareholding_row(symbol: str, info: dict) -> dict | None:
    """Best-effort only — see module docstring. Returns None if Yahoo
    gave us neither field, rather than writing an all-null row."""
    insiders = _normalize_pct_field(info.get("heldPercentInsiders"))
    institutions = _normalize_pct_field(info.get("heldPercentInstitutions"))
    if insiders is None and institutions is None:
        return None

    promoter = insiders  # closest available proxy, NOT equivalent to NSE "promoter" — see docstring
    dii = institutions   # institutional total, not split into FII vs DII — see docstring
    fii = None
    public = None
    known = [v for v in (promoter, dii) if v is not None]
    if known:
        public = max(0.0, round(100.0 - sum(known), 4))

    return {
        "symbol": symbol,
        "quarter": "latest",
        "promoter_pct": promoter,
        "fii_pct": fii,
        "dii_pct": dii,
        "public_pct": public,
    }


# ------------------------------------------------------------------
# DB writes
# ------------------------------------------------------------------

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
        :market_cap_cr, :book_value, 'yfinance'
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
        source = 'yfinance',
        updated_at = now()
""")

UPSERT_SHAREHOLDING = text("""
    insert into shareholding_pattern (
        symbol, quarter, promoter_pct, fii_pct, dii_pct, public_pct, source
    ) values (
        :symbol, :quarter, :promoter_pct, :fii_pct, :dii_pct, :public_pct, 'yfinance_approx'
    )
    on conflict (symbol, quarter) do update set
        promoter_pct = excluded.promoter_pct,
        fii_pct = excluded.fii_pct,
        dii_pct = excluded.dii_pct,
        public_pct = excluded.public_pct,
        source = 'yfinance_approx',
        updated_at = now()
""")


def upsert_financials(engine, row: dict):
    with engine.begin() as conn:
        conn.execute(UPSERT_FINANCIALS, row)


def upsert_shareholding(engine, row: dict):
    with engine.begin() as conn:
        conn.execute(UPSERT_SHAREHOLDING, row)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N universe companies (smoke test)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but skip all DB writes")
    parser.add_argument("--skip-shareholding", action="store_true", help="Only write financials_quarterly, skip the shareholding_pattern approximation")
    args = parser.parse_args()

    engine = None if args.dry_run else get_engine()

    companies = UNIVERSE[: args.limit] if args.limit else UNIVERSE

    n_ok = 0
    n_roce = 0
    n_shareholding = 0
    failed = []

    for i, company in enumerate(companies, start=1):
        symbol = company["symbol"]
        ticker = company["yahoo_ticker"]
        print(f"[{i}/{len(companies)}] {symbol} ({ticker}) ...", flush=True)

        try:
            yft = yf.Ticker(ticker)
            info = yft.info or {}
            if not info:
                raise ValueError("empty info payload")

            roce_pct = compute_roce(yft)
            if roce_pct is not None:
                n_roce += 1

            fin_row = build_financials_row(symbol, info, roce_pct)
            if engine:
                upsert_financials(engine, fin_row)
            n_ok += 1
            print(f"  pe={fin_row['pe']} roe={fin_row['roe_pct']} roce={fin_row['roce_pct']} "
                  f"d/e={fin_row['debt_to_equity']} rev_growth={fin_row['revenue_growth_pct']}")

            if not args.skip_shareholding:
                sh_row = build_shareholding_row(symbol, info)
                if sh_row is not None:
                    if engine:
                        upsert_shareholding(engine, sh_row)
                    n_shareholding += 1

        except Exception as exc:
            print(f"  FAILED: {exc}")
            failed.append(symbol)

        time.sleep(REQUEST_DELAY_SECONDS)

    print()
    print("fetch_fundamentals summary")
    print(f"  Universe processed:        {len(companies)}")
    print(f"  Financials written:        {n_ok}")
    print(f"  With computed ROCE:        {n_roce}")
    print(f"  Shareholding (approx) written: {n_shareholding}")
    print(f"  Failed:                    {len(failed)}")
    if failed:
        print(f"    {', '.join(failed)}")
    if args.dry_run:
        print("  (dry run -- nothing was written to the DB)")


if __name__ == "__main__":
    main()

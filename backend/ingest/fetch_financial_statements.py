"""Quarterly & Annual Financial Statement ingestion (Module 7).

Populates `financial_statements` — a *real* multi-period history table,
unlike `financials_quarterly`'s single 'latest' snapshot row (see that
table's comment block in db/schema.sql for why this had to be a new
table rather than an extension of the old one).

Source: yfinance's statement endpoints, which return actual historical
periods (unlike `Ticker.info`, a point-in-time snapshot):
    Ticker.quarterly_income_stmt / Ticker.income_stmt
    Ticker.quarterly_balance_sheet / Ticker.balance_sheet
    Ticker.quarterly_cashflow / Ticker.cashflow
Each is a DataFrame: index = line-item label, columns = period-end
Timestamps (most recent first). Typically 4-5 quarterly periods and 4
annual periods are available for a well-covered NSE large/mid-cap;
smaller or newly-listed companies may have fewer, and Yahoo's statement
coverage for Indian companies is inconsistent for banks/NBFCs in
particular (different line-item taxonomy for financial-sector filings)
— see `_first_available` below, which tries several label spellings and
returns None (never fabricates) when none match.

What's computed vs. read directly:
  - EBITDA: yfinance sometimes has an 'EBITDA' line directly in the
    income statement; when it doesn't, this falls back to
    Operating Income + Depreciation & Amortization (from the cashflow
    statement, which is where D&A is most reliably reported). If
    neither source has the inputs, ebitda_cr/ebitda_margin_pct are None.
  - Operating Margin: Operating Income / Revenue. None if either input
    is missing.
  - Free Cash Flow: prefers yfinance's own 'Free Cash Flow' line; falls
    back to Operating Cash Flow + Capital Expenditure (Yahoo reports
    CapEx as a negative outflow, so this is addition, not subtraction).
  - Debt: prefers 'Total Debt'; falls back to Long Term Debt + Current
    Debt (both, whichever are present) when 'Total Debt' isn't reported.
  - Cash: prefers 'Cash And Cash Equivalents'; falls back to 'Cash Cash
    Equivalents And Short Term Investments' (a broader Yahoo line some
    companies get instead of the narrower one).
  - Revenue, Net Profit, EPS: read directly off the income statement,
    no derivation.

Never fabricated: any metric with no matching line item anywhere in the
three statements for that period is written as SQL NULL, which the API
and frontend both already treat as N/A end-to-end.

Fiscal-period labels use the Indian April-March fiscal year convention
(Q1 FY26 = Apr-Jun 2025, ..., Q4 FY26 = Jan-Mar 2026; FY26 = year ending
31 Mar 2026) — see `_fiscal_label`. This is a labeling convention, not a
guess about the underlying data: the period_end date itself (used for
sorting and for the primary key) always comes straight from yfinance's
own column, unaltered.

Usage:
    python -m ingest.fetch_financial_statements
    python -m ingest.fetch_financial_statements --limit 10          # smoke test
    python -m ingest.fetch_financial_statements --dry-run           # fetch + parse only
    python -m ingest.fetch_financial_statements --workers 8         # concurrency
    python -m ingest.fetch_financial_statements --periods-only quarterly
"""
import argparse
import logging

import pandas as pd
from sqlalchemy import text

from ingest.db import get_engine
from ingest.fiscal import fiscal_label as _fiscal_label
from ingest.resilience import ConcurrentRunner, retry

logger = logging.getLogger("ingest.fetch_financial_statements")

CR = 1e7  # 1 crore = 10,000,000 — Yahoo reports absolute INR

# Line-item label candidates, most-specific/most-common first. yfinance's
# statement line-item names are not perfectly standardized across
# sectors (banks/NBFCs in particular often lack 'Capital Expenditure' or
# report 'Total Debt' differently), so every lookup tries a short list
# of known spellings before giving up and returning None.
_REVENUE_LABELS = ("Total Revenue", "Operating Revenue")
_NET_PROFIT_LABELS = ("Net Income", "Net Income Common Stockholders", "Net Income Continuous Operations")
_EPS_LABELS = ("Diluted EPS", "Basic EPS")
_OPERATING_INCOME_LABELS = ("Operating Income", "Total Operating Income As Reported")
_EBITDA_LABELS = ("EBITDA", "Normalized EBITDA")
_DA_LABELS = ("Depreciation And Amortization", "Depreciation Amortization Depletion", "Depreciation")
_CASH_LABELS = ("Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
_TOTAL_DEBT_LABELS = ("Total Debt",)
_LONG_TERM_DEBT_LABELS = ("Long Term Debt", "Long Term Debt And Capital Lease Obligation")
_CURRENT_DEBT_LABELS = ("Current Debt", "Current Debt And Capital Lease Obligation")
_FCF_LABELS = ("Free Cash Flow",)
_OCF_LABELS = ("Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
_CAPEX_LABELS = ("Capital Expenditure", "Purchase Of PPE")


def _first_available(df: "pd.DataFrame | None", labels: tuple, column) -> float | None:
    """Return the first non-null value found for any of `labels` in
    `column` of `df`. None if the frame is missing, the column doesn't
    exist, or no label matches — never guesses."""
    if df is None or df.empty or column not in df.columns:
        return None
    for label in labels:
        if label in df.index:
            v = df.loc[label, column]
            if v is not None and not (isinstance(v, float) and v != v):  # not NaN
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
    return None


def _to_cr(v: float | None) -> float | None:
    return round(v / CR, 4) if v is not None else None


def _build_period_row(symbol: str, period_type: str, period_end, income, balance, cashflow) -> dict:
    revenue = _first_available(income, _REVENUE_LABELS, period_end)
    net_profit = _first_available(income, _NET_PROFIT_LABELS, period_end)
    eps = _first_available(income, _EPS_LABELS, period_end)
    operating_income = _first_available(income, _OPERATING_INCOME_LABELS, period_end)

    ebitda = _first_available(income, _EBITDA_LABELS, period_end)
    if ebitda is None:
        da = _first_available(cashflow, _DA_LABELS, period_end)
        if operating_income is not None and da is not None:
            ebitda = operating_income + da

    ebitda_margin_pct = round(ebitda / revenue * 100, 4) if ebitda is not None and revenue else None
    operating_margin_pct = (
        round(operating_income / revenue * 100, 4) if operating_income is not None and revenue else None
    )

    cash = _first_available(balance, _CASH_LABELS, period_end)

    debt = _first_available(balance, _TOTAL_DEBT_LABELS, period_end)
    if debt is None:
        lt = _first_available(balance, _LONG_TERM_DEBT_LABELS, period_end)
        st = _first_available(balance, _CURRENT_DEBT_LABELS, period_end)
        if lt is not None or st is not None:
            debt = (lt or 0.0) + (st or 0.0)

    fcf = _first_available(cashflow, _FCF_LABELS, period_end)
    if fcf is None:
        ocf = _first_available(cashflow, _OCF_LABELS, period_end)
        capex = _first_available(cashflow, _CAPEX_LABELS, period_end)
        if ocf is not None and capex is not None:
            fcf = ocf + capex  # capex is reported as a negative outflow

    return {
        "symbol": symbol,
        "period_type": period_type,
        "period_end": period_end.date(),
        "period_label": _fiscal_label(period_end, period_type),
        "revenue_cr": _to_cr(revenue),
        "net_profit_cr": _to_cr(net_profit),
        "eps": round(eps, 4) if eps is not None else None,
        "ebitda_cr": _to_cr(ebitda),
        "ebitda_margin_pct": ebitda_margin_pct,
        "operating_margin_pct": operating_margin_pct,
        "cash_cr": _to_cr(cash),
        "debt_cr": _to_cr(debt),
        "free_cash_flow_cr": _to_cr(fcf),
    }


def build_statement_rows(symbol: str, yft, period_type: str) -> list[dict]:
    """Pure-ish (only touches yft's cached statement properties, no
    network call beyond what yfinance already did in `Ticker`) — builds
    one row per period yfinance reports for this symbol/period_type."""
    if period_type == "quarterly":
        income, balance, cashflow = yft.quarterly_income_stmt, yft.quarterly_balance_sheet, yft.quarterly_cashflow
    else:
        income, balance, cashflow = yft.income_stmt, yft.balance_sheet, yft.cashflow

    if income is None or income.empty:
        return []

    rows = []
    for period_end in income.columns:
        row = _build_period_row(symbol, period_type, period_end, income, balance, cashflow)
        # Skip a period that yielded literally nothing usable — an
        # all-None row would just be an N/A row taking up a primary key
        # slot for no benefit.
        if any(row[k] is not None for k in ("revenue_cr", "net_profit_cr", "eps", "ebitda_cr", "cash_cr", "debt_cr", "free_cash_flow_cr")):
            rows.append(row)
    return rows


UPSERT_STATEMENT = text(
    """
    insert into financial_statements (
        symbol, period_type, period_end, period_label, revenue_cr,
        net_profit_cr, eps, ebitda_cr, ebitda_margin_pct,
        operating_margin_pct, cash_cr, debt_cr, free_cash_flow_cr, source
    ) values (
        :symbol, :period_type, :period_end, :period_label, :revenue_cr,
        :net_profit_cr, :eps, :ebitda_cr, :ebitda_margin_pct,
        :operating_margin_pct, :cash_cr, :debt_cr, :free_cash_flow_cr, 'yfinance'
    )
    on conflict (symbol, period_type, period_end) do update set
        period_label = excluded.period_label,
        revenue_cr = excluded.revenue_cr,
        net_profit_cr = excluded.net_profit_cr,
        eps = excluded.eps,
        ebitda_cr = excluded.ebitda_cr,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        operating_margin_pct = excluded.operating_margin_pct,
        cash_cr = excluded.cash_cr,
        debt_cr = excluded.debt_cr,
        free_cash_flow_cr = excluded.free_cash_flow_cr,
        source = 'yfinance',
        updated_at = now()
    """
)


def upsert_rows(engine, rows: list[dict]):
    if not rows:
        return
    with engine.begin() as conn:
        for row in rows:
            conn.execute(UPSERT_STATEMENT, row)


@retry(times=3, base_delay_seconds=2.0, exceptions=(Exception,))
def _fetch_one(company: dict, period_types: list[str]) -> tuple[str, list[dict]]:
    import yfinance as yf

    symbol, ticker = company["symbol"], company["yahoo_ticker"]
    yft = yf.Ticker(ticker)
    rows: list[dict] = []
    for pt in period_types:
        rows.extend(build_statement_rows(symbol, yft, pt))
    if not rows:
        raise ValueError(f"no usable statement rows for {symbol} ({ticker})")
    return symbol, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N universe companies")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but skip DB writes")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent fetch workers (default 4 — be polite to Yahoo's unofficial endpoint)")
    parser.add_argument(
        "--periods-only",
        choices=["quarterly", "annual"],
        default=None,
        help="Only fetch one period type (default: both)",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from ingest.universe import UNIVERSE

    companies = UNIVERSE[: args.limit] if args.limit else UNIVERSE
    period_types = [args.periods_only] if args.periods_only else ["quarterly", "annual"]
    engine = None if args.dry_run else get_engine()

    runner = ConcurrentRunner(max_workers=args.workers, delay_seconds=1.5)

    def handle_result(company, result, error):
        symbol = company["symbol"]
        if error is not None:
            logger.info("[%s] FAILED: %s", symbol, error)
            return
        _, rows = result
        if engine is not None:
            upsert_rows(engine, rows)
        n_q = sum(1 for r in rows if r["period_type"] == "quarterly")
        n_a = sum(1 for r in rows if r["period_type"] == "annual")
        logger.info("[%s] wrote %d quarterly + %d annual periods", symbol, n_q, n_a)

    summary = runner.run(companies, lambda c: _fetch_one(c, period_types), handle_result)

    logger.info("")
    logger.info("fetch_financial_statements summary")
    logger.info("  Universe processed: %d", len(companies))
    logger.info("  Succeeded:          %d", summary.n_ok)
    logger.info("  Failed:             %d", summary.n_failed)
    if summary.failed_keys:
        logger.info("    %s", ", ".join(summary.failed_keys))
    if args.dry_run:
        logger.info("  (dry run -- nothing was written to the DB)")


if __name__ == "__main__":
    main()

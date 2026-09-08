"""Business logic for Module 7 — Quarterly & Annual Financial Statements.

Reads the real multi-period history in `financial_statements` (written by
`ingest/fetch_financial_statements.py`) and returns the Current/Previous/
Difference/Growth% comparison the Research page's Quarterly Comparison
and Annual Comparison tables render. All arithmetic (diff, growth%)
happens here, never on the frontend — same convention as every other
derived-data service in this codebase (see fundamental_service.py's own
docstring for the same rule).

This supersedes the old `fundamental_service.get_quarterly_comparison` /
`get_annual_comparison`, which inferred quarterly-vs-annual by the gap
between two dated rows in `financials_quarterly` — a heuristic that
never actually worked because nothing wrote more than one dated row per
company (see db/schema.sql's `financial_statements` comment block for
the full explanation). `financial_statements` has an explicit
`period_type` column, so no inference is needed here at all.

Both `get_quarterly_comparison` and `get_annual_comparison` return the
exact same shape the frontend already expects (`ComparisonTable` in
schemas/company.py / shared/api/types.ts) — this module is a drop-in
replacement, not a new contract.
"""
from typing import List, Optional, Tuple

from sqlalchemy import text

from db.db import engine

# Metric label -> financial_statements column. Every metric the brief
# asked for now has a real source column (unlike the old
# fundamental_service table, which was missing EBITDA/Operating
# Margin/Cash/Debt entirely) — see db/schema.sql's financial_statements
# table and ingest/fetch_financial_statements.py for exactly how each
# one is sourced or derived.
COMPARISON_METRICS: List[Tuple[str, str]] = [
    ("Revenue", "revenue_cr"),
    ("Net Profit", "net_profit_cr"),
    ("EPS", "eps"),
    ("EBITDA", "ebitda_cr"),
    ("EBITDA Margin", "ebitda_margin_pct"),
    ("Operating Margin", "operating_margin_pct"),
    ("Cash", "cash_cr"),
    ("Debt", "debt_cr"),
    ("Free Cash Flow", "free_cash_flow_cr"),
]

_HISTORY_QUERY = text(
    """
    select period_end, period_label, revenue_cr, net_profit_cr, eps, ebitda_cr,
           ebitda_margin_pct, operating_margin_pct, cash_cr, debt_cr, free_cash_flow_cr
    from financial_statements
    where symbol = :symbol and period_type = :period_type
    order by period_end desc
    limit :limit
    """
)


def _period_rows(symbol: str, period_type: str, limit: int = 2) -> List[dict]:
    with engine.connect() as conn:
        rows = (
            conn.execute(_HISTORY_QUERY, {"symbol": symbol.upper(), "period_type": period_type, "limit": limit})
            .mappings()
            .all()
        )
    return list(rows)


def _metric_row(label: str, column: str, current: Optional[dict], previous: Optional[dict]) -> dict:
    cur_val = float(current[column]) if current and current[column] is not None else None
    prev_val = float(previous[column]) if previous and previous[column] is not None else None
    diff = cur_val - prev_val if cur_val is not None and prev_val is not None else None
    growth = (diff / abs(prev_val)) * 100 if diff is not None and prev_val else None
    return {"metric": label, "current": cur_val, "previous": prev_val, "diff": diff, "growthPct": growth}


def _comparison_table(symbol: str, period_type: str) -> dict:
    rows = _period_rows(symbol, period_type, limit=2)
    current = rows[0] if rows else None
    previous = rows[1] if len(rows) > 1 else None
    return {
        "currentLabel": current["period_label"] if current else None,
        "previousLabel": previous["period_label"] if previous else None,
        "rows": [_metric_row(label, col, current, previous) for label, col in COMPARISON_METRICS],
    }


def get_quarterly_comparison(symbol: str) -> dict:
    """GET /company/{symbol}/quarterly (and the embedded
    Company.quarterlyComparison field) — Current vs Previous Quarter,
    most recent two `period_type='quarterly'` rows for this symbol."""
    return _comparison_table(symbol, "quarterly")


def get_annual_comparison(symbol: str) -> dict:
    """GET /company/{symbol}/annual (and the embedded
    Company.annualComparison field) — Current vs Previous FY, most
    recent two `period_type='annual'` rows for this symbol."""
    return _comparison_table(symbol, "annual")


# ---------------------------------------------------------------------------
# Trend signals (R1) — directional trend over the last 4 quarters.
# ---------------------------------------------------------------------------

# Number of periods to use for trend computation. 4 gives us 3 differences,
# enough to distinguish consistent direction from noise. If fewer periods
# exist (company is newer), we still compute with what is available.
_TREND_PERIODS = 4

_TREND_HISTORY_QUERY = text(
    """
    select period_end, revenue_cr, net_profit_cr, ebitda_margin_pct, free_cash_flow_cr
    from financial_statements
    where symbol = :symbol and period_type = 'quarterly'
    order by period_end desc
    limit :limit
    """
)


def _linear_direction(values: List[Optional[float]]) -> str:
    """Given a list of values ordered newest-first, return a human-readable
    direction label by fitting a simple slope across non-null values.

    Using (newest - oldest) / n_periods as the slope proxy — fast, robust
    to gaps, and interpretable without importing scipy. Returns:
      'Accelerating'  — positive slope ≥ +5% of the mean (strong improvement)
      'Improving'     — positive slope < +5% of the mean (mild improvement)
      'Steady'        — slope near zero (within ±2% of the mean)
      'Decelerating'  — negative slope > -10% of the mean (mild worsening)
      'Contracting'   — negative slope ≤ -10% of the mean (clear worsening)
      'Insufficient'  — fewer than 2 non-null values
    """
    non_null = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(non_null) < 2:
        return "Insufficient"

    # Newest value is index 0 (query is DESC), oldest is last.
    newest_val = non_null[0][1]
    oldest_val = non_null[-1][1]
    n = non_null[-1][0] - non_null[0][0]  # actual period span

    if n == 0:
        return "Insufficient"

    slope = (newest_val - oldest_val) / n
    mean_abs = sum(abs(v) for _, v in non_null) / len(non_null)

    if mean_abs == 0:
        return "Steady"

    slope_pct = slope / mean_abs

    if slope_pct >= 0.05:
        return "Accelerating"
    if slope_pct >= 0.02:
        return "Improving"
    if slope_pct > -0.02:
        return "Steady"
    if slope_pct > -0.10:
        return "Decelerating"
    return "Contracting"


def _trend_signal(label: str, column_values: List[Optional[float]], unit: str = "") -> dict:
    direction = _linear_direction(column_values)
    non_null = [v for v in column_values if v is not None]
    delta = (non_null[0] - non_null[-1]) if len(non_null) >= 2 else None
    return {
        "metric": label,
        "direction": direction,
        "delta": delta,
        "unit": unit,
        # Full series newest-first so the frontend can spark if it wants.
        "series": column_values,
    }


_HISTORICAL_PE_QUERY = text(
    """
    select period_end, eps
    from financial_statements
    where symbol = :symbol and period_type = 'annual' and eps is not null and eps > 0
    order by period_end desc
    limit 5
    """
)

_ANNUAL_PRICES_QUERY = text(
    """
    select
        date_trunc('year', date) as year,
        max(high) as annual_high,
        min(low)  as annual_low
    from prices_daily
    where symbol = :symbol
    group by date_trunc('year', date)
    order by year desc
    limit 5
    """
)


def get_historical_pe_range(symbol: str, current_pe: Optional[float]) -> Optional[dict]:
    """Compute an approximate historical P/E range using annual EPS from
    `financial_statements` and annual OHLC from `prices_daily`.

    Returns a dict with:
      pe_min        — lowest approximate P/E over the window
      pe_max        — highest approximate P/E over the window
      pe_median     — median P/E over the window
      current_pe    — forwarded through (the snapshot P/E from financials_quarterly)
      percentile    — where current_pe sits in the historical distribution (0-100)
      years         — how many annual periods were used
    Returns None when fewer than 2 annual periods of EPS exist or prices are missing.
    """
    with engine.connect() as conn:
        eps_rows = conn.execute(_HISTORICAL_PE_QUERY, {"symbol": symbol.upper()}).mappings().all()
        price_rows = conn.execute(_ANNUAL_PRICES_QUERY, {"symbol": symbol.upper()}).mappings().all()

    if not eps_rows or not price_rows:
        return None

    # Build a year -> EPS lookup (period_end is a date, take its year)
    eps_by_year: dict[int, float] = {}
    for row in eps_rows:
        year = row["period_end"].year
        eps_by_year[year] = float(row["eps"])

    # Compute a mid-price P/E per year using (high+low)/2 as the representative price
    pe_vals: list[float] = []
    for row in price_rows:
        year = int(row["year"].year)
        if year not in eps_by_year:
            continue
        eps = eps_by_year[year]
        if eps <= 0:
            continue
        mid_price = (float(row["annual_high"]) + float(row["annual_low"])) / 2
        pe = mid_price / eps
        if 0 < pe < 500:  # sanity cap — extremely high P/E is usually a transient loss year
            pe_vals.append(pe)

    if len(pe_vals) < 2:
        return None

    pe_sorted = sorted(pe_vals)
    pe_min = pe_sorted[0]
    pe_max = pe_sorted[-1]
    n = len(pe_sorted)
    mid = n // 2
    pe_median = pe_sorted[mid] if n % 2 else (pe_sorted[mid - 1] + pe_sorted[mid]) / 2

    percentile: Optional[int] = None
    if current_pe is not None and current_pe > 0:
        below = sum(1 for v in pe_sorted if v <= current_pe)
        percentile = round((below / n) * 100)

    return {
        "pe_min": round(pe_min, 1),
        "pe_max": round(pe_max, 1),
        "pe_median": round(pe_median, 1),
        "current_pe": round(current_pe, 1) if current_pe else None,
        "percentile": percentile,
        "years": n,
    }


def get_trend_signals(symbol: str) -> List[dict]:
    """Returns directional trend signals for the 4 key value-creation
    metrics — Revenue, Net Profit, EBITDA Margin, and Free Cash Flow —
    computed from the last 4 quarters of `financial_statements`.

    Each signal has:
      metric    — human-readable name
      direction — Accelerating | Improving | Steady | Decelerating |
                  Contracting | Insufficient
      delta     — raw difference (newest minus oldest), same units as series
      unit      — 'Cr' for absolute amounts, '%' for margin
      series    — [newest, ..., oldest] list for optional sparklines
    """
    with engine.connect() as conn:
        rows = (
            conn.execute(
                _TREND_HISTORY_QUERY,
                {"symbol": symbol.upper(), "limit": _TREND_PERIODS},
            )
            .mappings()
            .all()
        )

    if not rows:
        return []

    def col(key: str) -> List[Optional[float]]:
        return [float(r[key]) if r[key] is not None else None for r in rows]

    return [
        _trend_signal("Revenue", col("revenue_cr"), "Cr"),
        _trend_signal("Net Profit", col("net_profit_cr"), "Cr"),
        _trend_signal("EBITDA Margin", col("ebitda_margin_pct"), "%"),
        _trend_signal("Free Cash Flow", col("free_cash_flow_cr"), "Cr"),
    ]


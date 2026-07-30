"""Indian fiscal-year labeling helper, shared by
ingest/fetch_financial_statements.py and ingest/fetch_shareholding.py so
the two pipelines can never disagree on what a given calendar date is
called in FY terms.

Indian fiscal year runs 1 April (Y-1) - 31 March (Y), referred to as
"FYY" (e.g. FY26 = 1 Apr 2025 - 31 Mar 2026). This is a *labeling*
convention only — it never alters the underlying date used for sorting
or as a primary-key column; that's always the real date the data source
reported, unmodified.
"""
from datetime import date

_QUARTER_BY_MONTH = {4: 1, 5: 1, 6: 1, 7: 2, 8: 2, 9: 2, 10: 3, 11: 3, 12: 3, 1: 4, 2: 4, 3: 4}


def fiscal_year_label(d: date) -> str:
    """e.g. 2025-06-30 -> 'FY26', 2025-02-15 -> 'FY25'."""
    fy_end_year = d.year if d.month <= 3 else d.year + 1
    return f"FY{str(fy_end_year)[-2:]}"


def fiscal_quarter_label(d: date) -> str:
    """e.g. 2025-06-30 -> 'Q1 FY26'."""
    return f"Q{_QUARTER_BY_MONTH[d.month]} {fiscal_year_label(d)}"


def fiscal_label(d: date, period_type: str) -> str:
    return fiscal_year_label(d) if period_type == "annual" else fiscal_quarter_label(d)

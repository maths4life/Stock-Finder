"""Reusable scoring/discovery heuristics.

Pulled out of company_service.py because these are v1 placeholder rules
(not real financial models) that more than one module needs:
- Module 1 (Companies) uses them to fill riskLevel / expectedReturnPct /
  investmentHorizonMonths on every company.
- Module 4 (Screener) will filter on riskLevel/horizon.
- Module 9 (AI Insights) will likely want to explain or replace these.

Centralizing them here means upgrading the heuristic later (or swapping
in a real model) is a one-file change instead of a hunt across services.
Same transparent-rule-based spirit as ingest/compute_scores.py — nothing
here is real investment advice; see API_CONTRACT.md's known-gaps table.
"""
from typing import Dict, List, Optional, Tuple


def risk_level(debt_to_equity: Optional[float], roe: Optional[float]) -> str:
    """v1 heuristic: higher leverage or negative returns on capital reads
    as higher risk. Not a real risk assessment."""
    if debt_to_equity is None:
        return "Moderate"
    if debt_to_equity > 1.5 or (roe is not None and roe < 0):
        return "High"
    if debt_to_equity > 0.5:
        return "Moderate"
    return "Low"


def expected_return_and_horizon(
    risk_level_value: str, overall_score: Optional[float]
) -> Tuple[float, int]:
    """Placeholder heuristic keyed off risk level + overall score."""

    # Convert Decimal/int/None safely to float
    score = float(overall_score) if overall_score is not None else 50.0

    base = {
        "Low": 10.0,
        "Moderate": 14.0,
        "High": 20.0,
    }.get(risk_level_value, 12.0)

    score_adj = (score - 50.0) * 0.15

    horizon = {
        "Low": 24,
        "Moderate": 12,
        "High": 6,
    }.get(risk_level_value, 12)

    return round(base + score_adj, 1), horizon


# ---------------------------------------------------------------------------
# Module 3 additions — Research page "Pros/Cons", "Checklist", "Verdict"
# sections. Same spirit as the two functions above and as
# ingest/compute_scores.py's build_rationale: transparent, threshold-based
# reads of fields the caller already computed (roe, pe, rsi, ...) — no new
# queries, no LLM call, nothing invented. Centralized here (not in
# company_service.py) for the same reason risk_level/expected_return_and_
# horizon are: Module 9 (AI Insights) will likely want to explain or
# replace these later, and should import one function, not copy-paste it.
# ---------------------------------------------------------------------------


def research_checklist(fields: Dict) -> List[Dict]:
    """v1 rule-based checklist for the Research page's Scorecard section.
    Each item is a plain threshold read of already-computed Company
    fields — not a new data source, not a real due-diligence checklist."""
    rsi = fields.get("rsi") or 0.0
    return [
        {"label": "ROE above 15%", "done": (fields.get("roe") or 0.0) > 15},
        {"label": "Promoter holding above 50%", "done": (fields.get("promoterHoldingPct") or 0.0) > 50},
        {"label": "Trading above 200-day average", "done": bool(fields.get("aboveEma200"))},
        {"label": "Profit growth positive YoY", "done": (fields.get("profitGrowthPct") or 0.0) > 0},
        {"label": "Reasonable valuation (P/E under 40)", "done": 0 < (fields.get("pe") or 0.0) < 40},
        {"label": "RSI in a healthy range (30-70)", "done": 0 < rsi < 70},
    ]


def trend_label(above_50dma: Optional[bool], above_200dma: Optional[bool]) -> str:
    """v1 rule-based trend classification for the Research page's
    Technical Metrics section — the schema has no dedicated 'trend'
    column, so this reads it off the two moving-average flags that
    ingest/compute_technicals.py already writes. Not a forecast."""
    if above_50dma and above_200dma:
        return "Uptrend"
    if not above_50dma and not above_200dma:
        return "Downtrend"
    return "Sideways"

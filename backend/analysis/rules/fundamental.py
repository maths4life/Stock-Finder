"""Fundamental-analysis rules for Module 6.

Every function is a pure, deterministic threshold read of fields that
company_service.py has already computed (roe, roce, debtToEquity,
currentRatio, salesGrowthPct, profitGrowthPct, pe, pb, peg, divYield).
No new data, no company-specific branching, no LLM — same pattern as
services/scoring_service.py's pros_and_cons/research_checklist.

Each `*_notes` function returns a List[str] of bullet sentences (empty
list if nothing meets a threshold) so the caller can build the
`fundamental_analysis` sub-sections directly.
"""
from typing import Dict, List


def profitability_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    roe = fields.get("roe") or 0.0
    roce = fields.get("roce") or 0.0

    if roe < 0:
        notes.append(f"Return on equity is negative at {roe:.1f}%, indicating the business is currently loss-making on equity capital.")
    elif roe > 25:
        notes.append(f"ROE of {roe:.1f}% is exceptional and well clear of the 15% quality threshold.")
    elif roe > 18:
        notes.append(f"ROE of {roe:.1f}% is strong, comfortably above the 15% quality bar.")
    elif roe > 15:
        notes.append(f"ROE of {roe:.1f}% is above-average, just past the 15% quality bar.")
    else:
        notes.append(f"ROE of {roe:.1f}% sits below the 15% quality threshold.")

    if roce > 18:
        notes.append(f"ROCE of {roce:.1f}% points to efficient capital allocation across the business.")
    elif 0 < roce <= 18:
        notes.append(f"ROCE of {roce:.1f}% is moderate, below the 18% high-efficiency mark.")

    if roe and roce and roe > roce + 8:
        notes.append("ROE running well ahead of ROCE suggests leverage is inflating the equity return rather than pure operating efficiency.")

    return notes


def growth_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    sales_growth = fields.get("salesGrowthPct") or 0.0
    profit_growth = fields.get("profitGrowthPct") or 0.0

    if sales_growth > 20:
        notes.append(f"Revenue growth of {sales_growth:.1f}% YoY is strong.")
    elif sales_growth > 10:
        notes.append(f"Revenue growth of {sales_growth:.1f}% YoY is moderate.")
    elif sales_growth >= 0:
        notes.append(f"Revenue growth of {sales_growth:.1f}% YoY is muted.")
    else:
        notes.append(f"Revenue contracted {abs(sales_growth):.1f}% YoY.")

    if profit_growth > 20:
        notes.append(f"Profit growth of {profit_growth:.1f}% YoY is strong.")
    elif profit_growth > 10:
        notes.append(f"Profit growth of {profit_growth:.1f}% YoY is healthy.")
    elif profit_growth >= 0:
        notes.append(f"Profit growth of {profit_growth:.1f}% YoY is modest.")
    else:
        notes.append(f"Profit contracted {abs(profit_growth):.1f}% YoY, an earnings headwind.")

    if profit_growth > sales_growth + 5:
        notes.append("Profit is growing faster than revenue, consistent with margin expansion.")
    elif sales_growth > profit_growth + 5 and sales_growth > 0:
        notes.append("Revenue is outpacing profit growth, consistent with margin compression.")

    return notes


def valuation_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    pe = fields.get("pe") or 0.0
    pb = fields.get("pb") or 0.0
    peg = fields.get("peg") or 0.0
    div_yield = fields.get("divYield") or 0.0

    if pe <= 0:
        notes.append("P/E is not meaningful (zero or negative), typically a sign of negligible or negative earnings.")
    elif pe <= 15:
        notes.append(f"P/E of {pe:.1f}x is inexpensive on an absolute basis.")
    elif pe <= 25:
        notes.append(f"P/E of {pe:.1f}x is a reasonable multiple.")
    elif pe <= 40:
        notes.append(f"P/E of {pe:.1f}x is elevated relative to the broader market.")
    else:
        notes.append(f"P/E of {pe:.1f}x is expensive relative to the broader market.")

    if peg:
        if peg < 1:
            notes.append(f"PEG of {peg:.2f} suggests the stock is attractively priced relative to its growth rate.")
        elif peg > 2:
            notes.append(f"PEG of {peg:.2f} suggests the stock is expensive relative to its growth rate.")

    if pb and pb > 6:
        notes.append(f"P/B of {pb:.1f}x is rich relative to book value.")

    if div_yield > 3:
        notes.append(f"Dividend yield of {div_yield:.1f}% offers a meaningful income cushion.")

    return notes


def balance_sheet_notes(fields: Dict) -> List[str]:
    notes: List[str] = []
    debt_to_equity = fields.get("debtToEquity") or 0.0
    current_ratio = fields.get("currentRatio") or 0.0

    if debt_to_equity > 1.5:
        notes.append(f"Debt/Equity of {debt_to_equity:.2f} indicates high leverage.")
    elif debt_to_equity > 1.0:
        notes.append(f"Debt/Equity of {debt_to_equity:.2f} reflects moderately higher leverage.")
    elif debt_to_equity > 0.5:
        notes.append(f"Debt/Equity of {debt_to_equity:.2f} is at a manageable level.")
    else:
        notes.append(f"Debt/Equity of {debt_to_equity:.2f} reflects a conservative, low-leverage balance sheet.")

    if 0 < current_ratio < 1:
        notes.append(f"Current ratio of {current_ratio:.2f} is below 1, a near-term liquidity flag.")
    elif 1 <= current_ratio < 1.5:
        notes.append(f"Current ratio of {current_ratio:.2f} is adequate.")
    elif current_ratio >= 1.5:
        notes.append(f"Current ratio of {current_ratio:.2f} is comfortable.")

    return notes

"""The single source of truth for Fundamental / Technical / Overall scoring.

Design goals (see MD/SCORING_ENGINE.md for the full quant-review write-up):

1. Transparent — every point awarded traces back to one real, stored
   number and one documented threshold. No black-box weights, no
   randomness, no LLM.
2. Reusable — services/company_service.py (live, per-request, powers
   both GET /companies and GET /company/{symbol}) and
   ingest/compute_scores.py (batch job that refreshes the `scores`
   table used for SQL-level sorting in Discover/Screener) both call
   the *same* `score_fundamentals` / `score_technicals` functions
   below over the *same* field contract, so the number a user sees on
   a card and the number they see on the detail page's "Why this
   score?" breakdown can never drift apart.
3. Honest about missing data — a metric with no underlying data is
   EXCLUDED from both the numerator and the denominator (score=0,
   maxScore=0) rather than silently defaulting to a neutral value.
   Scoring "guesses" as if they were real inputs was the main flaw in
   the v1 engine (a flat 50-point baseline nudged by whatever
   happened to be available) — see MD/SCORING_ENGINE.md §1 for the
   before/after comparison.

Input contract — a single flat dict, `m`, with these optional keys
(all may be None if the platform doesn't have the data for that
company yet):

  Fundamental inputs:
    roe, roce                  percent, e.g. 24.6
    salesGrowthPct             percent YoY
    profitGrowthPct            percent YoY
    debtToEquity                ratio
    currentRatio                ratio
    pe, pb, peg                  ratios
    sectorAvgPe                 percent-comparable ratio, peer average P/E
                                  (None if the sector has < 2 other priced peers)
    divYield                     percent
    promoterHoldingPct           percent

  Technical inputs:
    rsi                          0-100
    aboveEma50, aboveEma200      bool
    goldenCross, deathCross      bool
    volumeBreakout               bool (latest volume > 1.5x the 20-day average)
    price, high52w, low52w       currency units, for 52-week range position

Every metric function returns a dict:
    {
        "metric": str,
        "value": float | bool | None,   # the company's actual reading
        "score": float,
        "maxScore": float,
        "pass": bool,
        "reason": str,
    }
"""
from typing import Dict, List, Optional, TypedDict


class ScoreMetric(TypedDict):
    metric: str
    value: Optional[float]
    score: float
    maxScore: float
    passed: bool
    reason: str


def _metric(metric: str, value, score: float, max_score: float, passed: bool, reason: str) -> ScoreMetric:
    return {
        "metric": metric,
        "value": value,
        "score": round(score, 1),
        "maxScore": max_score,
        "passed": passed,
        "reason": reason,
    }


def _unavailable(metric: str, reason: str) -> ScoreMetric:
    """A metric the engine could not evaluate because the underlying
    field is missing. Excluded from the score total (score=0,
    maxScore=0) rather than penalized or defaulted."""
    return _metric(metric, None, 0.0, 0.0, False, reason)


# ---------------------------------------------------------------------------
# Fundamental metrics
# ---------------------------------------------------------------------------
# Max points below sum to 100 when every input is available:
#   ROE 12 · ROCE 10 · Revenue Growth 10 · Profit Growth 12 · Debt/Equity 12 ·
#   Current Ratio 8 · P/E vs Sector 10 · PEG 8 · P/B 6 · Dividend Yield 4 ·
#   Promoter Holding 8
#
# Weighting rationale: profitability and growth (ROE+ROCE+growth = 44 pts)
# carry the most weight because they drive long-run compounding; leverage
# and liquidity (20 pts) protect against downside risk; valuation (24 pts)
# matters but is deliberately capped below profitability+growth since a
# cheap multiple on a deteriorating business is a value trap, not quality;
# ownership (8 pts) is a lower-weight qualitative tiebreaker, not a
# fundamental driver on its own.


def _score_roe(m: Dict) -> ScoreMetric:
    roe = m.get("roe")
    if roe is None:
        return _unavailable("ROE", "Return on equity data is not available for this company.")
    # 15% is the standard "quality" threshold used elsewhere on the
    # platform (analysis/rules/fundamental.py, scoring_service.research_checklist).
    if roe < 0:
        return _metric("ROE", roe, 0, 12, False, f"ROE is negative ({roe:.1f}%), the business is currently loss-making on equity capital.")
    if roe >= 25:
        return _metric("ROE", roe, 12, 12, True, f"ROE of {roe:.1f}% is exceptional, well clear of the 15% quality threshold.")
    if roe >= 20:
        return _metric("ROE", roe, 10, 12, True, f"ROE of {roe:.1f}% is strong, comfortably above the 15% quality threshold.")
    if roe >= 15:
        return _metric("ROE", roe, 8, 12, True, f"ROE of {roe:.1f}% clears the 15% quality threshold.")
    if roe >= 10:
        return _metric("ROE", roe, 5, 12, False, f"ROE of {roe:.1f}% is below the 15% quality threshold but still positive.")
    return _metric("ROE", roe, 2, 12, False, f"ROE of {roe:.1f}% is well below the 15% quality threshold.")


def _score_roce(m: Dict) -> ScoreMetric:
    roce = m.get("roce")
    if roce is None:
        return _unavailable("ROCE", "Return on capital employed data is not available for this company.")
    if roce >= 20:
        return _metric("ROCE", roce, 10, 10, True, f"ROCE of {roce:.1f}% indicates highly efficient capital allocation.")
    if roce >= 15:
        return _metric("ROCE", roce, 8, 10, True, f"ROCE of {roce:.1f}% clears the 15% capital-efficiency bar.")
    if roce >= 10:
        return _metric("ROCE", roce, 5, 10, False, f"ROCE of {roce:.1f}% is moderate, below the 15% high-efficiency mark.")
    if roce >= 0:
        return _metric("ROCE", roce, 2, 10, False, f"ROCE of {roce:.1f}% is low, capital is not being deployed efficiently.")
    return _metric("ROCE", roce, 0, 10, False, f"ROCE is negative ({roce:.1f}%), capital employed is currently destroying value.")


def _score_revenue_growth(m: Dict) -> ScoreMetric:
    g = m.get("salesGrowthPct")
    if g is None:
        return _unavailable("Revenue Growth (YoY)", "Revenue growth data is not available for this company.")
    if g >= 20:
        return _metric("Revenue Growth (YoY)", g, 10, 10, True, f"Revenue growth of {g:.1f}% YoY is strong.")
    if g >= 10:
        return _metric("Revenue Growth (YoY)", g, 7, 10, True, f"Revenue growth of {g:.1f}% YoY is healthy.")
    if g >= 0:
        return _metric("Revenue Growth (YoY)", g, 4, 10, False, f"Revenue growth of {g:.1f}% YoY is muted.")
    return _metric("Revenue Growth (YoY)", g, 0, 10, False, f"Revenue contracted {abs(g):.1f}% YoY.")


def _score_profit_growth(m: Dict) -> ScoreMetric:
    g = m.get("profitGrowthPct")
    sales_g = m.get("salesGrowthPct")
    if g is None:
        return _unavailable("Profit Growth (YoY)", "Profit growth data is not available for this company.")
    note = ""
    if sales_g is not None:
        if g > sales_g + 5:
            note = " Profit is outpacing revenue, consistent with margin expansion."
        elif sales_g > g + 5 and sales_g > 0:
            note = " Revenue is outpacing profit, consistent with margin compression."
    if g >= 25:
        return _metric("Profit Growth (YoY)", g, 12, 12, True, f"Profit growth of {g:.1f}% YoY is strong.{note}")
    if g >= 15:
        return _metric("Profit Growth (YoY)", g, 9, 12, True, f"Profit growth of {g:.1f}% YoY is healthy.{note}")
    if g >= 0:
        return _metric("Profit Growth (YoY)", g, 5, 12, False, f"Profit growth of {g:.1f}% YoY is modest.{note}")
    return _metric("Profit Growth (YoY)", g, 0, 12, False, f"Profit contracted {abs(g):.1f}% YoY, an earnings headwind.{note}")


def _score_debt_to_equity(m: Dict) -> ScoreMetric:
    de = m.get("debtToEquity")
    if de is None:
        return _unavailable("Debt / Equity", "Debt-to-equity data is not available for this company.")
    if de <= 0.3:
        return _metric("Debt / Equity", de, 12, 12, True, f"Debt/Equity of {de:.2f} reflects a conservative, low-leverage balance sheet.")
    if de <= 0.5:
        return _metric("Debt / Equity", de, 10, 12, True, f"Debt/Equity of {de:.2f} is comfortably low.")
    if de <= 1.0:
        return _metric("Debt / Equity", de, 6, 12, True, f"Debt/Equity of {de:.2f} is at a manageable level.")
    if de <= 1.5:
        return _metric("Debt / Equity", de, 3, 12, False, f"Debt/Equity of {de:.2f} reflects moderately elevated leverage.")
    return _metric("Debt / Equity", de, 0, 12, False, f"Debt/Equity of {de:.2f} indicates high leverage risk.")


def _score_current_ratio(m: Dict) -> ScoreMetric:
    cr = m.get("currentRatio")
    if cr is None or cr <= 0:
        return _unavailable("Current Ratio", "Current ratio data is not available for this company.")
    if cr >= 1.5:
        return _metric("Current Ratio", cr, 8, 8, True, f"Current ratio of {cr:.2f} is comfortable; short-term obligations are well covered.")
    if cr >= 1.2:
        return _metric("Current Ratio", cr, 6, 8, True, f"Current ratio of {cr:.2f} is adequate.")
    if cr >= 1.0:
        return _metric("Current Ratio", cr, 4, 8, True, f"Current ratio of {cr:.2f} is at the 1.0x minimum-coverage line.")
    return _metric("Current Ratio", cr, 1, 8, False, f"Current ratio of {cr:.2f} is below 1.0x, a near-term liquidity flag.")


def _score_pe(m: Dict) -> ScoreMetric:
    """P/E judged against the company's own sector peers when at least
    two priced peers exist (services/company_service.py's
    _fetch_sector_avg_pe); otherwise falls back to absolute market
    bands. Sector-relative valuation is a real improvement over a
    single absolute P/E cutoff, which penalizes entire sectors (e.g.
    IT services) that structurally trade at different multiples than
    others (e.g. banks) — but it's only used when there's real peer
    data to compare against, never invented."""
    pe = m.get("pe")
    sector_avg = m.get("sectorAvgPe")
    if pe is None:
        return _unavailable("P/E vs Sector", "P/E data is not available for this company.")
    if pe <= 0:
        return _metric("P/E vs Sector", pe, 0, 10, False, "P/E is not meaningful (zero or negative, typically due to negative earnings).")

    if sector_avg and sector_avg > 0:
        ratio = pe / sector_avg
        base = f"P/E of {pe:.1f}x vs sector average {sector_avg:.1f}x"
        if ratio <= 0.7:
            return _metric("P/E vs Sector", pe, 10, 10, True, f"{base} — trading at a deep discount to peers.")
        if ratio <= 0.9:
            return _metric("P/E vs Sector", pe, 8, 10, True, f"{base} — trading below peer average.")
        if ratio <= 1.1:
            return _metric("P/E vs Sector", pe, 6, 10, True, f"{base} — in line with peers.")
        if ratio <= 1.4:
            return _metric("P/E vs Sector", pe, 3, 10, False, f"{base} — trading at a premium to peers.")
        return _metric("P/E vs Sector", pe, 0, 10, False, f"{base} — trading at a rich premium to peers.")

    # Fallback: absolute bands, used only when no sector comparison exists.
    if pe <= 15:
        return _metric("P/E (absolute)", pe, 8, 10, True, f"P/E of {pe:.1f}x is inexpensive on an absolute basis (sector average unavailable).")
    if pe <= 25:
        return _metric("P/E (absolute)", pe, 6, 10, True, f"P/E of {pe:.1f}x is a reasonable multiple (sector average unavailable).")
    if pe <= 40:
        return _metric("P/E (absolute)", pe, 3, 10, False, f"P/E of {pe:.1f}x is elevated (sector average unavailable).")
    return _metric("P/E (absolute)", pe, 0, 10, False, f"P/E of {pe:.1f}x is expensive on an absolute basis (sector average unavailable).")


def _score_peg(m: Dict) -> ScoreMetric:
    peg = m.get("peg")
    if peg is None or peg <= 0:
        return _unavailable("PEG Ratio", "PEG ratio is not meaningful (zero, negative, or unavailable — usually because growth is negative).")
    if peg < 1:
        return _metric("PEG Ratio", peg, 8, 8, True, f"PEG of {peg:.2f} suggests the stock is attractively priced relative to its growth rate.")
    if peg <= 1.5:
        return _metric("PEG Ratio", peg, 6, 8, True, f"PEG of {peg:.2f} is reasonable relative to growth.")
    if peg <= 2:
        return _metric("PEG Ratio", peg, 3, 8, False, f"PEG of {peg:.2f} is a little rich relative to growth.")
    return _metric("PEG Ratio", peg, 0, 8, False, f"PEG of {peg:.2f} suggests the stock is expensive relative to its growth rate.")


def _score_pb(m: Dict) -> ScoreMetric:
    pb = m.get("pb")
    if pb is None or pb <= 0:
        return _unavailable("Price / Book", "Price-to-book data is not available for this company.")
    if pb <= 1:
        return _metric("Price / Book", pb, 6, 6, True, f"P/B of {pb:.2f}x is trading at or below book value.")
    if pb <= 3:
        return _metric("Price / Book", pb, 4, 6, True, f"P/B of {pb:.2f}x is reasonable relative to book value.")
    if pb <= 6:
        return _metric("Price / Book", pb, 2, 6, False, f"P/B of {pb:.2f}x is rich relative to book value.")
    return _metric("Price / Book", pb, 0, 6, False, f"P/B of {pb:.2f}x is very rich relative to book value.")


def _score_dividend_yield(m: Dict) -> ScoreMetric:
    dy = m.get("divYield")
    if dy is None:
        return _unavailable("Dividend Yield", "Dividend yield data is not available for this company.")
    # Intentionally low weight (4 pts): a 0% yield is normal and often
    # preferable for a high-growth reinvestment story, so this rewards
    # an income cushion without penalizing growth compounders that pay
    # no dividend at all.
    if dy >= 3:
        return _metric("Dividend Yield", dy, 4, 4, True, f"Dividend yield of {dy:.2f}% offers a meaningful income cushion.")
    if dy >= 1:
        return _metric("Dividend Yield", dy, 2, 4, True, f"Dividend yield of {dy:.2f}% is a modest income contribution.")
    if dy > 0:
        return _metric("Dividend Yield", dy, 1, 4, False, f"Dividend yield of {dy:.2f}% is minimal.")
    return _metric("Dividend Yield", dy, 0, 4, False, "No dividend is currently paid — neutral for growth names, a gap for income mandates.")


def _score_promoter_holding(m: Dict) -> ScoreMetric:
    p = m.get("promoterHoldingPct")
    if p is None or p <= 0:
        return _unavailable("Promoter Holding", "Promoter shareholding data is not available for this company.")
    if p >= 60:
        return _metric("Promoter Holding", p, 8, 8, True, f"Promoter holding of {p:.1f}% signals strong skin-in-the-game.")
    if p >= 50:
        return _metric("Promoter Holding", p, 6, 8, True, f"Promoter holding of {p:.1f}% is above the 50% majority-control threshold.")
    if p >= 30:
        return _metric("Promoter Holding", p, 3, 8, False, f"Promoter holding of {p:.1f}% is moderate.")
    return _metric("Promoter Holding", p, 0, 8, False, f"Promoter holding of {p:.1f}% is low.")


_FUNDAMENTAL_RULES = [
    _score_roe,
    _score_roce,
    _score_revenue_growth,
    _score_profit_growth,
    _score_debt_to_equity,
    _score_current_ratio,
    _score_pe,
    _score_peg,
    _score_pb,
    _score_dividend_yield,
    _score_promoter_holding,
]


# ---------------------------------------------------------------------------
# Technical metrics
# ---------------------------------------------------------------------------
# Max points sum to 100 when every input is available:
#   RSI 20 · Above 50 DMA 15 · Above 200 DMA 20 · Golden/Death Cross 15 ·
#   Volume Breakout 10 · 52-Week Range Position 20
#
# Weighting rationale: the 200-day trend (20 pts) is weighted above the
# 50-day trend (15 pts) because the long-term trend is the more decisive
# regime signal; RSI and 52-week range position (20 pts each) both
# capture momentum/positioning but from different angles (oscillator vs.
# price level) so both are kept, at equal weight, rather than letting one
# proxy for the other. Golden/death cross is a trend-*change* signal,
# distinct from the above-DMA level checks, so it is not a duplicate.


def _score_rsi(m: Dict) -> ScoreMetric:
    rsi = m.get("rsi")
    if rsi is None or rsi <= 0:
        return _unavailable("RSI (14)", "RSI data is not available for this company.")
    # Bands match the qualitative thresholds already used elsewhere on
    # the platform (analysis/rules/technical.momentum_notes): >70
    # overbought, <30 oversold, 55-70 constructive, 45-55 neutral.
    if rsi >= 80:
        return _metric("RSI (14)", rsi, 6, 20, False, f"RSI of {rsi:.0f} is extremely overbought, elevated reversal risk.")
    if rsi >= 70:
        return _metric("RSI (14)", rsi, 10, 20, False, f"RSI of {rsi:.0f} is overbought.")
    if rsi >= 55:
        return _metric("RSI (14)", rsi, 20, 20, True, f"RSI of {rsi:.0f} shows healthy, constructive momentum.")
    if rsi >= 45:
        return _metric("RSI (14)", rsi, 15, 20, True, f"RSI of {rsi:.0f} is neutral.")
    if rsi >= 30:
        return _metric("RSI (14)", rsi, 8, 20, False, f"RSI of {rsi:.0f} shows cooling, soft momentum.")
    return _metric("RSI (14)", rsi, 4, 20, False, f"RSI of {rsi:.0f} is oversold — momentum-negative even if the stock looks 'cheap'.")


def _score_above_50dma(m: Dict) -> ScoreMetric:
    v = m.get("aboveEma50")
    if v is None:
        return _unavailable("Above 50-Day Average", "50-day moving average data is not available for this company.")
    if v:
        return _metric("Above 50-Day Average", True, 15, 15, True, "Price is trading above its 50-day moving average, a constructive near/medium-term trend.")
    return _metric("Above 50-Day Average", False, 0, 15, False, "Price is trading below its 50-day moving average.")


def _score_above_200dma(m: Dict) -> ScoreMetric:
    v = m.get("aboveEma200")
    if v is None:
        return _unavailable("Above 200-Day Average", "200-day moving average data is not available for this company.")
    if v:
        return _metric("Above 200-Day Average", True, 20, 20, True, "Price is trading above its 200-day moving average, a constructive long-term trend.")
    return _metric("Above 200-Day Average", False, 0, 20, False, "Price is trading below its 200-day moving average, a long-term trend headwind.")


def _score_cross_signal(m: Dict) -> ScoreMetric:
    golden_raw, death_raw = m.get("goldenCross"), m.get("deathCross")
    if golden_raw is None and death_raw is None:
        return _unavailable("Golden / Death Cross", "Moving average crossover data is not available for this company.")
    golden, death = bool(golden_raw), bool(death_raw)
    if golden:
        return _metric("Golden / Death Cross", "Golden Cross", 15, 15, True, "A recent golden cross (50-day average crossing above the 200-day average) is a bullish trend-change signal.")
    if death:
        return _metric("Golden / Death Cross", "Death Cross", 0, 15, False, "A recent death cross (50-day average crossing below the 200-day average) is a bearish trend-change signal.")
    return _metric("Golden / Death Cross", "None detected", 8, 15, True, "No golden or death cross in the recent window — neutral, no fresh trend-change signal.")


def _score_volume_breakout(m: Dict) -> ScoreMetric:
    v = m.get("volumeBreakout")
    if v is None:
        return _unavailable("Volume Breakout", "Volume data is not available for this company.")
    if v:
        return _metric("Volume Breakout", True, 10, 10, True, "Recent volume surged more than 1.5x the 20-day average, signaling a pickup in participation.")
    return _metric("Volume Breakout", False, 5, 10, True, "Volume is trading in line with its 20-day average — no penalty, this is the normal state.")


def _score_52w_range(m: Dict) -> ScoreMetric:
    price, high, low = m.get("price"), m.get("high52w"), m.get("low52w")
    if not price or not high or not low or high <= low:
        return _unavailable("52-Week Range Position", "52-week high/low data is not available for this company.")
    position = (price - low) / (high - low)
    position = max(0.0, min(1.0, position))
    pct = position * 100
    if position >= 0.90:
        return _metric("52-Week Range Position", pct, 20, 20, True, f"Trading at {pct:.0f}% of its 52-week range — near highs, strong relative strength (watch for resistance overhead).")
    if position >= 0.70:
        return _metric("52-Week Range Position", pct, 16, 20, True, f"Trading at {pct:.0f}% of its 52-week range — firmly in the upper band.")
    if position >= 0.40:
        return _metric("52-Week Range Position", pct, 10, 20, False, f"Trading at {pct:.0f}% of its 52-week range — mid-range, no clear edge.")
    if position >= 0.20:
        return _metric("52-Week Range Position", pct, 5, 20, False, f"Trading at {pct:.0f}% of its 52-week range — closer to support, weak positioning.")
    return _metric("52-Week Range Position", pct, 2, 20, False, f"Trading at {pct:.0f}% of its 52-week range — near 52-week lows, a breakdown-risk zone if support fails.")


_TECHNICAL_RULES = [
    _score_rsi,
    _score_above_50dma,
    _score_above_200dma,
    _score_cross_signal,
    _score_volume_breakout,
    _score_52w_range,
]


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

# Fundamental is weighted above technical: for an investing (not trading)
# research platform, business quality and valuation are the primary
# decision driver over a multi-month+ horizon, with technicals used as a
# timing/confirmation overlay — a common institutional-research split
# (vs. the previous engine's unweighted 50/50 split, which gave a
# momentum-only trader's read equal say to the business's actual quality).
FUNDAMENTAL_WEIGHT = 0.60
TECHNICAL_WEIGHT = 0.40


def _aggregate(breakdown: List[ScoreMetric]) -> float:
    """Percentage of *available* points earned, 0-100. Metrics with no
    underlying data (maxScore=0) are excluded rather than counted
    against the company. Returns 50.0 (neutral) only if literally no
    metric had data — an edge case for a brand-new/untracked company."""
    total_max = sum(x["maxScore"] for x in breakdown)
    if total_max <= 0:
        return 50.0
    total_score = sum(x["score"] for x in breakdown)
    return round(100 * total_score / total_max, 1)


def score_fundamentals(m: Dict) -> Dict:
    breakdown = [rule(m) for rule in _FUNDAMENTAL_RULES]
    return {"score": _aggregate(breakdown), "breakdown": breakdown}


def score_technicals(m: Dict) -> Dict:
    breakdown = [rule(m) for rule in _TECHNICAL_RULES]
    return {"score": _aggregate(breakdown), "breakdown": breakdown}


def compute_scores(m: Dict) -> Dict:
    """The one function callers should use. Returns:
        {
            "fundamentalScore": float,
            "technicalScore": float,
            "overallScore": float,
            "weighting": {"fundamental": 0.6, "technical": 0.4},
            "scoreBreakdown": {"fundamental": [...], "technical": [...]},
        }
    overallScore is always exactly FUNDAMENTAL_WEIGHT*fundamentalScore +
    TECHNICAL_WEIGHT*technicalScore — never re-derived elsewhere — unless
    one side has no data at all, in which case the other side stands in
    alone (same graceful-degradation behavior as the v1 engine)."""
    fundamental = score_fundamentals(m)
    technical = score_technicals(m)

    fundamental_available = any(x["maxScore"] > 0 for x in fundamental["breakdown"])
    technical_available = any(x["maxScore"] > 0 for x in technical["breakdown"])

    if fundamental_available and technical_available:
        overall = FUNDAMENTAL_WEIGHT * fundamental["score"] + TECHNICAL_WEIGHT * technical["score"]
    elif fundamental_available:
        overall = fundamental["score"]
    elif technical_available:
        overall = technical["score"]
    else:
        overall = 50.0

    return {
        "fundamentalScore": fundamental["score"],
        "technicalScore": technical["score"],
        "overallScore": round(overall, 1),
        "weighting": {"fundamental": FUNDAMENTAL_WEIGHT, "technical": TECHNICAL_WEIGHT},
        "scoreBreakdown": {"fundamental": fundamental["breakdown"], "technical": technical["breakdown"]},
    }


def verdict_for(overall: float) -> str:
    """Unchanged from the v1 engine (ingest/compute_scores.py) — same
    labels, same thresholds, kept here so both callers share one
    definition."""
    if overall >= 75:
        return "Strong Conviction"
    if overall >= 60:
        return "Watch"
    if overall >= 45:
        return "Under Review"
    return "Pass"

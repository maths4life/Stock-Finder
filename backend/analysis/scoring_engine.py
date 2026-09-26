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

  Sprint 3 (v2) additions — Fundamental:
    earningsQuality             dict or None — result of _compute_earnings_quality();
                                  contains 'direction', 'consistency_score', 'n_periods',
                                  'profit_series' (list of net_profit_cr newest-first).
                                  Pre-computed by company_service/compute_scores from
                                  financial_statements rows (4-8 quarters).
    fiiTrendPct                 float or None — FII/FPI holding change (pp) from latest
                                  minus previous quarter in shareholding_pattern.
                                  Positive = institutional buying, negative = selling.
    diiTrendPct                 float or None — same for DII. Scored together as one
                                  institutional-interest metric.
    sectorRoePercentile         float 0-100 or None — ROE percentile rank vs sector peers
                                  (100 = best in sector). Computed from peer ROE values.
    sectorRocePercentile        float 0-100 or None — same for ROCE.
    sectorDePercentile          float 0-100 or None — D/E percentile (inverted: 100 =
                                  lowest debt/equity in sector = best).

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


# ---------------------------------------------------------------------------
# Sprint 3 (v2) metric additions
# ---------------------------------------------------------------------------
# Three new fundamental metrics, all following the same honest-missing-data
# contract as the v1.5 metrics above. Max points:
#   Earnings Quality            10 pts
#   Institutional Trend         8 pts
#   Sector-Relative Position    12 pts   (replaces absolute thresholds for
#                                          ROE/ROCE/D/E when sector data exists)
# Total adds 30 pts to the fundamental side when all three are available,
# keeping the 60/40 overall split unchanged (both sides still normalise
# to 0-100 as a percentage of available points).


def _score_earnings_quality(m: Dict) -> ScoreMetric:
    """Multi-quarter earnings consistency from `financial_statements`.

    Pre-computed by company_service/_compute_earnings_quality before the
    engine runs, so no DB call happens here. Scores direction + consistency:
    - Consistent growth (positive direction, low stddev) = full marks.
    - Improving but volatile = partial.
    - Declining or contracting = penalty.
    Only evaluated when ≥3 quarterly periods exist (fewer periods can't
    meaningfully distinguish trend from noise)."""
    eq = m.get("earningsQuality")
    if not eq or eq.get("n_periods", 0) < 3:
        return _unavailable(
            "Earnings Quality",
            "Fewer than 3 quarters of financial history are available — trend cannot be assessed yet.",
        )

    direction = eq.get("direction", "Insufficient")
    n = eq.get("n_periods", 0)
    consistency = eq.get("consistency_score", 0.0)  # 0-1, higher = more consistent

    period_note = f"({n} quarters)"

    if direction == "Accelerating" and consistency >= 0.7:
        return _metric("Earnings Quality", direction, 10, 10, True,
                        f"Earnings are accelerating with high consistency {period_note} — a strong quality signal.")
    if direction == "Accelerating":
        return _metric("Earnings Quality", direction, 8, 10, True,
                        f"Earnings are accelerating {period_note} but with some quarter-to-quarter volatility.")
    if direction == "Improving" and consistency >= 0.6:
        return _metric("Earnings Quality", direction, 7, 10, True,
                        f"Earnings are improving steadily {period_note}.")
    if direction == "Improving":
        return _metric("Earnings Quality", direction, 5, 10, True,
                        f"Earnings are improving {period_note} but the trend is uneven.")
    if direction == "Steady":
        return _metric("Earnings Quality", direction, 4, 10, False,
                        f"Earnings are flat {period_note} — no growth momentum, but no deterioration either.")
    if direction == "Decelerating":
        return _metric("Earnings Quality", direction, 2, 10, False,
                        f"Earnings growth is decelerating {period_note} — watch for further weakness.")
    # Contracting or Insufficient
    return _metric("Earnings Quality", direction, 0, 10, False,
                   f"Earnings are contracting {period_note} — a material fundamental headwind.")


def _score_institutional_trend(m: Dict) -> ScoreMetric:
    """FII/DII institutional interest trend (quarter-over-quarter change).

    Addresses SCORING_ENGINE.md §0.3's explicitly deferred item: FII/DII
    *trend* (direction, not level). Available here because shareholding_pattern
    now has multi-quarter history (two rows needed to compute a diff).

    fiiTrendPct and diiTrendPct are percentage-point changes (latest minus
    previous quarter) pre-fetched by company_service/compute_scores from
    shareholding_pattern — same table as Promoter Holding, no extra query
    needed beyond what already runs. Both being None means we only have one
    quarter of data (can't diff), so this metric is excluded.

    Scored together as one signal because both FII and DII buying
    simultaneously is a genuinely strong institutional endorsement, while
    mixed signals are noise rather than a score-worthy event."""
    fii = m.get("fiiTrendPct")
    dii = m.get("diiTrendPct")

    if fii is None and dii is None:
        return _unavailable(
            "Institutional Trend (FII + DII)",
            "Only one quarter of shareholding data is available — trend direction cannot be computed yet.",
        )

    # At least one is not None — use what we have.
    fii = fii or 0.0
    dii = dii or 0.0
    combined = fii + dii
    fii_str = f"FII {fii:+.2f}pp"
    dii_str = f"DII {dii:+.2f}pp"
    detail = f"{fii_str}, {dii_str}"

    if combined >= 1.0:
        return _metric("Institutional Trend (FII + DII)", combined, 8, 8, True,
                        f"Both FII and DII holdings increased this quarter ({detail}) — strong institutional buying signal.")
    if combined >= 0.3:
        return _metric("Institutional Trend (FII + DII)", combined, 6, 8, True,
                        f"Net institutional buying ({detail}) — modest positive signal.")
    if combined >= -0.3:
        return _metric("Institutional Trend (FII + DII)", combined, 4, 8, True,
                        f"Institutional holdings were broadly stable ({detail}) — no clear directional signal.")
    if combined >= -1.0:
        return _metric("Institutional Trend (FII + DII)", combined, 2, 8, False,
                        f"Net institutional selling ({detail}) — mild caution signal.")
    return _metric("Institutional Trend (FII + DII)", combined, 0, 8, False,
                   f"Significant institutional selling ({detail}) — a notable ownership headwind.")


def _score_sector_relative_fundamentals(m: Dict) -> ScoreMetric:
    """Sector-relative position for ROE, ROCE, and Debt/Equity.

    The single biggest model correctness improvement in v2 (SCORING_ENGINE.md
    §3.1): a 12% ROE may be excellent for a utility and weak for an IT firm.
    Three inputs are scored together as one composite metric to keep the
    breakdown readable — each contributes 4 pts of the 12 total, so even
    partial availability is useful.

    Percentiles are pre-computed by company_service/compute_scores against
    same-sector peers in `financials_quarterly`/`companies`, same peer set
    as the existing sectorAvgPe query. Falls back gracefully when a sector
    has < 3 peers (too thin to trust a percentile) or when inputs are None.

    sectorRoePercentile / sectorRocePercentile: 100 = top of sector (best).
    sectorDePercentile: 100 = lowest D/E in sector = best (inverted rank).
    """
    roe_pct = m.get("sectorRoePercentile")
    roce_pct = m.get("sectorRocePercentile")
    de_pct = m.get("sectorDePercentile")

    available = [(v, label) for v, label in [
        (roe_pct, "ROE"), (roce_pct, "ROCE"), (de_pct, "D/E (inverted)")
    ] if v is not None]

    if not available:
        return _unavailable(
            "Sector-Relative Position (ROE / ROCE / D/E)",
            "No sector peer data is available to benchmark this company's fundamentals against.",
        )

    def _pts(pct: float) -> float:
        """4-point scale per metric: top quartile = 4, bottom = 0."""
        if pct >= 75:
            return 4.0
        if pct >= 50:
            return 3.0
        if pct >= 25:
            return 1.5
        return 0.0

    total_score = sum(_pts(v) for v, _ in available)
    total_max = len(available) * 4.0

    # Build a readable summary of each available metric's rank.
    parts = []
    for v, label in available:
        if v >= 75:
            parts.append(f"{label} top quartile ({v:.0f}th pct)")
        elif v >= 50:
            parts.append(f"{label} above median ({v:.0f}th pct)")
        elif v >= 25:
            parts.append(f"{label} below median ({v:.0f}th pct)")
        else:
            parts.append(f"{label} bottom quartile ({v:.0f}th pct)")

    summary = "; ".join(parts)
    passed = total_score >= total_max * 0.5

    return _metric(
        "Sector-Relative Position (ROE / ROCE / D/E)",
        round(total_score, 1),
        total_score,
        12.0,
        passed,
        f"vs sector peers — {summary}.",
    )


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
    # Sprint 3 (v2) additions:
    _score_earnings_quality,
    _score_institutional_trend,
    _score_sector_relative_fundamentals,
]



# ---------------------------------------------------------------------------
# Technical metrics
# ---------------------------------------------------------------------------
# Max points sum to 100 when every input is available:
#   RSI 25 · Above 200 DMA 20 · Above 50 DMA 15 · Golden/Death Cross 15 ·
#   Volume Breakout 15 · 52-Week Range Position 10
#
# Rebalancing rationale (v2, fixes the "rewards buying at highs" bias
# identified in the scoring audit):
#
# - RSI raised 20→25: the most nuanced technical indicator available; its
#   overbought/oversold/constructive bands already encode both momentum quality
#   and reversal risk, so giving it the top weight makes the score more
#   sensitive to actual momentum health rather than price level.
#
# - Volume Breakout raised 10→15: genuine institutional participation signal
#   that is independent of price level. A stock near 52-week lows with a
#   volume surge is a very different situation from one at highs; this weight
#   lets that information surface.
#
# - 52-Week Range Position cut 20→10 AND rewritten as a bell curve: the
#   old linear score (90th percentile = full marks) created a feedback loop
#   where already-extended stocks always scored higher than oversold quality
#   names. The new curve rewards the 30-70% zone (healthy accumulation) with
#   full marks; near highs and near lows both earn partial credit but with
#   different explanatory notes, letting the user distinguish between
#   "extended" and "opportunity" rather than treating both as failures.
#
# - DMA weights unchanged: 200-day trend (20 pts) as the regime signal and
#   50-day trend (15 pts) as the confirmation overlay remain the right split
#   for a multi-month investing horizon.


def _score_rsi(m: Dict) -> ScoreMetric:
    rsi = m.get("rsi")
    if rsi is None or rsi <= 0:
        return _unavailable("RSI (14)", "RSI data is not available for this company.")
    # Bands: >70 overbought, <30 oversold, 55-70 constructive, 45-55 neutral.
    # Max raised to 25 pts from 20 — most nuanced single technical indicator.
    if rsi >= 80:
        return _metric("RSI (14)", rsi, 8, 25, False, f"RSI of {rsi:.0f} is extremely overbought — momentum is stretched, elevated reversal risk.")
    if rsi >= 70:
        return _metric("RSI (14)", rsi, 13, 25, False, f"RSI of {rsi:.0f} is overbought.")
    if rsi >= 55:
        return _metric("RSI (14)", rsi, 25, 25, True, f"RSI of {rsi:.0f} shows healthy, constructive momentum.")
    if rsi >= 45:
        return _metric("RSI (14)", rsi, 18, 25, True, f"RSI of {rsi:.0f} is neutral — no strong momentum signal.")
    if rsi >= 30:
        return _metric("RSI (14)", rsi, 10, 25, False, f"RSI of {rsi:.0f} shows cooling momentum.")
    return _metric("RSI (14)", rsi, 5, 25, False, f"RSI of {rsi:.0f} is oversold — momentum is negative regardless of price level.")


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
        return _metric("Volume Breakout", True, 15, 15, True, "Recent volume surged >1.5× the 20-day average — signals genuine institutional participation.")
    return _metric("Volume Breakout", False, 7, 15, True, "Volume is in line with the 20-day average — normal, no penalty.")


def _score_52w_range(m: Dict) -> ScoreMetric:
    """Bell-curve scoring: rewards the 30-70% zone (healthy accumulation),
    gives partial credit near highs (extended but strong) and near lows
    (potential opportunity but downtrend risk). No longer a linear
    'higher = better' that mechanically boosted extended stocks."""
    price, high, low = m.get("price"), m.get("high52w"), m.get("low52w")
    if not price or not high or not low or high <= low:
        return _unavailable("52-Week Range", "52-week high/low data is not available for this company.")
    position = max(0.0, min(1.0, (price - low) / (high - low)))
    pct = position * 100
    # Bell curve: 30-70% = full marks (healthy accumulation zone),
    # 70-85% = good (upper band but not extended),
    # >85% = moderate (near highs, resistance risk),
    # 15-30% = moderate (lower band, weak but not broken),
    # <15% = low (near 52w lows, downtrend risk).
    if 0.30 <= position <= 0.70:
        return _metric("52-Week Range", pct, 10, 10, True, f"At {pct:.0f}% of the 52-week range — healthy accumulation zone, neither extended nor broken.")
    if 0.70 < position <= 0.85:
        return _metric("52-Week Range", pct, 8, 10, True, f"At {pct:.0f}% of the 52-week range — upper band, strong but watch for overhead resistance.")
    if position > 0.85:
        return _metric("52-Week Range", pct, 5, 10, False, f"At {pct:.0f}% of the 52-week range — near highs, momentum is extended.")
    if position >= 0.15:
        return _metric("52-Week Range", pct, 4, 10, False, f"At {pct:.0f}% of the 52-week range — lower band, weak near-term trend.")
    return _metric("52-Week Range", pct, 2, 10, False, f"At {pct:.0f}% of the 52-week range — near 52-week lows, high downtrend risk.")


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

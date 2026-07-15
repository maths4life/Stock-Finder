"""Business logic for the Discover page (Module 2).

Route layer (routes/discover.py) stays thin: call one of these functions,
return the result. Every function issues a small, fixed number of queries
regardless of universe size (same discipline as services/company_service.py).

Honesty notes (documented instead of silently faked — same spirit as
API_CONTRACT.md's "Known data gaps" table for Module 1):

- Discover Groups and Sector Pulse are real, computed groupings over the
  actual `companies` / `financials_quarterly` / `technical_snapshot` /
  `scores` tables — not hand-picked mock symbols.
- "In the News" from the old mock has no real backing (no news table yet —
  that's Module 6's job) and has been replaced with "Biggest Movers", a
  real signal (largest absolute daily change) instead of a fabricated one.
- Market Indicators in the old mock (NIFTY 50, USD/INR, India VIX, 10Y
  G-Sec) are index/forex/bond figures with no source anywhere in the
  schema — this project only ingests per-company prices/fundamentals, not
  index-level or macro data. Rather than invent numbers, this module
  computes real market-breadth statistics over the covered universe
  (advance/decline, average move, % above 200-DMA, median P/E, golden
  crosses). This is flagged clearly in API_CONTRACT.md and in the module
  output — a genuine data gap, not a bug.
"""
from datetime import datetime, timezone
from typing import Dict, List

from sqlalchemy import bindparam, text

from db.db import engine
from schemas.discover import DiscoverGroup, MarketIndicator, PipelineColumn, PipelineItem, SectorPulse

# ---------------------------------------------------------------------------
# Discover Groups
# ---------------------------------------------------------------------------

_GROUP_DEFS = [
    {
        "id": "fundamentals",
        "label": "Improving Fundamentals",
        "tagline": "Companies where the numbers turned a corner this quarter.",
        "layout": "list",
        "limit": 3,
        "query": text(
            """
            select c.symbol
            from companies c
            join financials_quarterly f
                on f.symbol = c.symbol and f.quarter = 'latest'
            where (f.revenue_growth_pct is not null and f.revenue_growth_pct > 0)
               or (f.profit_growth_pct is not null and f.profit_growth_pct > 0)
            order by (coalesce(f.revenue_growth_pct, 0) + coalesce(f.profit_growth_pct, 0)) desc
            limit :limit
            """
        ),
    },
    {
        "id": "technicals",
        "label": "Technical Momentum",
        "tagline": "Clean breakouts and healthy accumulation zones.",
        "layout": "grid",
        "limit": 2,
        "query": text(
            """
            select c.symbol
            from companies c
            join technical_snapshot t on t.symbol = c.symbol
            left join scores s on s.symbol = c.symbol
            where t.above_200dma = true
              and t.rsi_14 is not null
              and t.rsi_14 between 50 and 72
            order by coalesce(s.technical_score, 0) desc
            limit :limit
            """
        ),
    },
    {
        "id": "smallcap",
        "label": "Small & Mid Cap Watch",
        "tagline": "Under-covered names with the strongest scores in their weight class.",
        "layout": "list",
        "limit": 2,
        "query": text(
            """
            select c.symbol
            from companies c
            join financials_quarterly f
                on f.symbol = c.symbol and f.quarter = 'latest'
            left join scores s on s.symbol = c.symbol
            where f.market_cap_cr is not null and f.market_cap_cr < 20000
            order by coalesce(s.overall_score, 0) desc
            limit :limit
            """
        ),
    },
    {
        "id": "movers",
        "label": "Biggest Movers",
        "tagline": "Companies moving the most today, up or down.",
        "layout": "list",
        "limit": 2,
        "query": text(
            """
            select c.symbol
            from companies c
            join technical_snapshot t on t.symbol = c.symbol
            where t.change_pct is not null
            order by abs(t.change_pct) desc
            limit :limit
            """
        ),
    },
]


def get_discover_groups() -> List[dict]:
    """GET /discover/groups — 4 real, computed groupings. Exactly one query
    per group (4 total), each already LIMITed at the DB, so cost is fixed
    regardless of how many companies exist."""
    groups: List[dict] = []
    with engine.connect() as conn:
        for spec in _GROUP_DEFS:
            rows = conn.execute(spec["query"], {"limit": spec["limit"]}).all()
            symbols = [row[0] for row in rows]
            groups.append(
                DiscoverGroup(
                    id=spec["id"],
                    label=spec["label"],
                    tagline=spec["tagline"],
                    layout=spec["layout"],
                    symbols=symbols,
                ).model_dump()
            )
    return groups


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

_STAGE_HINTS = {
    "Watching": "Something caught your attention",
    "Researching": "Building the thesis",
    "Conviction": "Ready to hold for 6–12 months",
}
_STAGE_ORDER = ["Watching", "Researching", "Conviction"]

_PIPELINE_QUERY = text(
    """
    select stage, symbol, note, updated_at
    from pipeline_items
    order by updated_at desc
    """
)


def _humanize_ago(delta_seconds: float) -> str:
    """Small, dependency-free relative-time formatter — matches the mock's
    style ("2h ago", "1d ago", "1w ago")."""
    seconds = max(0, int(delta_seconds))
    if seconds < 3600:
        return f"{max(1, seconds // 60)}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    if seconds < 604800:
        return f"{seconds // 86400}d ago"
    return f"{seconds // 604800}w ago"


def get_pipeline() -> List[dict]:
    """GET /pipeline — reads the first-party `pipeline_items` table (already
    in schema.sql, section 5). One query total; grouping into stage columns
    happens in Python, not per-stage round trips."""
    by_stage: Dict[str, List[PipelineItem]] = {stage: [] for stage in _STAGE_ORDER}

    with engine.connect() as conn:
        rows = conn.execute(_PIPELINE_QUERY).mappings().all()

    now = datetime.now(timezone.utc)
    for row in rows:
        stage = row["stage"] if row["stage"] in by_stage else "Watching"
        updated_at = row["updated_at"]
        if updated_at is not None and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        ago = _humanize_ago((now - updated_at).total_seconds()) if updated_at else "—"
        by_stage[stage].append(
            PipelineItem(symbol=row["symbol"], note=row["note"] or "", ago=ago)
        )

    return [
        PipelineColumn(stage=stage, hint=_STAGE_HINTS[stage], items=by_stage[stage]).model_dump()
        for stage in _STAGE_ORDER
    ]


# ---------------------------------------------------------------------------
# Sector Pulse
# ---------------------------------------------------------------------------

_SECTOR_AGG_QUERY = text(
    """
    select
        c.sector,
        count(*) as n,
        avg(coalesce(s.overall_score, 50)) as avg_score,
        avg(coalesce(t.change_pct, 0)) as avg_change
    from companies c
    left join scores s on s.symbol = c.symbol
    left join technical_snapshot t on t.symbol = c.symbol
    where c.sector is not null
    group by c.sector
    order by avg_score desc
    limit :limit
    """
)

def _sentiment_for_score(avg_score: float) -> str:
    if avg_score >= 70:
        return "Bullish"
    if avg_score >= 55:
        return "Positive"
    if avg_score >= 40:
        return "Neutral"
    return "Bearish"


def get_sector_pulse(limit: int = 4) -> List[dict]:
    """GET /sectors/pulse — real aggregates over `companies` joined with
    `scores` and `technical_snapshot`, grouped by sector. Two queries total:
    one for the sector-level aggregate, one batched top-symbols lookup."""
    top_symbols_query = text(
        """
        select sector, symbol
        from (
            select
                c.sector,
                c.symbol,
                row_number() over (
                    partition by c.sector
                    order by coalesce(s.overall_score, 0) desc
                ) as rn
            from companies c
            left join scores s on s.symbol = c.symbol
            where c.sector in :sectors
        ) ranked
        where rn <= 2
        """
    ).bindparams(bindparam("sectors", expanding=True))

    with engine.connect() as conn:
        sector_rows = conn.execute(_SECTOR_AGG_QUERY, {"limit": limit}).mappings().all()
        sectors = [row["sector"] for row in sector_rows]

        top_symbols_by_sector: Dict[str, List[str]] = {s: [] for s in sectors}
        if sectors:
            top_rows = conn.execute(top_symbols_query, {"sectors": sectors}).mappings().all()
            for row in top_rows:
                top_symbols_by_sector.setdefault(row["sector"], []).append(row["symbol"])

    results = []
    for row in sector_rows:
        avg_score = float(row["avg_score"])
        avg_change = float(row["avg_change"])
        sentiment = _sentiment_for_score(avg_score)
        reason = (
            f"Average score {avg_score:.0f}/100 across {row['n']} covered "
            f"name{'s' if row['n'] != 1 else ''}, sector move {avg_change:+.2f}% today."
        )
        results.append(
            SectorPulse(
                sector=row["sector"],
                sentiment=sentiment,
                reason=reason,
                topSymbols=top_symbols_by_sector.get(row["sector"], []),
            ).model_dump()
        )
    return results


# ---------------------------------------------------------------------------
# Market Indicators
# ---------------------------------------------------------------------------

_MARKET_BREADTH_QUERY = text(
    """
    select
        count(*) filter (where t.change_pct > 0) as advancers,
        count(*) filter (where t.change_pct < 0) as decliners,
        avg(t.change_pct) as avg_change,
        avg(case when t.above_200dma then 1.0 else 0.0 end) * 100 as pct_above_200,
        percentile_cont(0.5) within group (order by f.pe) as median_pe,
        count(*) filter (where t.golden_cross = true) as golden_crosses
    from companies c
    left join technical_snapshot t on t.symbol = c.symbol
    left join financials_quarterly f
        on f.symbol = c.symbol and f.quarter = 'latest' and f.pe is not null and f.pe > 0
    """
)


def get_market_indicators() -> List[dict]:
    """GET /market/indicators — one aggregate query, real market-breadth
    statistics over the covered universe. See module docstring: this
    intentionally does NOT fabricate NIFTY/VIX/USD-INR-style figures the
    schema has no source for."""
    with engine.connect() as conn:
        row = conn.execute(_MARKET_BREADTH_QUERY).mappings().first()

    advancers = int(row["advancers"] or 0)
    decliners = int(row["decliners"] or 0)
    avg_change = float(row["avg_change"] or 0.0)
    pct_above_200 = float(row["pct_above_200"] or 0.0)
    median_pe = row["median_pe"]
    golden_crosses = int(row["golden_crosses"] or 0)

    def tone_for(value: float) -> str:
        if value > 0:
            return "positive"
        if value < 0:
            return "negative"
        return "neutral"

    indicators = [
        MarketIndicator(
            label="Advance / Decline",
            value=f"{advancers} / {decliners}",
            change="",
            tone=tone_for(advancers - decliners),
        ),
        MarketIndicator(
            label="Avg Move Today",
            value=f"{avg_change:+.2f}%",
            change="",
            tone=tone_for(avg_change),
        ),
        MarketIndicator(
            label="Above 200-DMA",
            value=f"{pct_above_200:.0f}%",
            change="",
            tone="positive" if pct_above_200 >= 50 else "neutral",
        ),
        MarketIndicator(
            label="Median P/E",
            value=f"{median_pe:.1f}" if median_pe is not None else "—",
            change="",
            tone="neutral",
        ),
        MarketIndicator(
            label="Golden Crosses",
            value=str(golden_crosses),
            change="",
            tone="positive" if golden_crosses > 0 else "neutral",
        ),
    ]
    return [ind.model_dump() for ind in indicators]

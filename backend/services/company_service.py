"""Business logic for the Companies module (Module 1).

Route layer (routes/companies.py) stays thin: parse query params, call one
of these functions, return the result.

Scalability notes (see API_CONTRACT.md for the full review):
- GET /companies (`get_all_companies`) issues exactly 3 queries total, no
  matter how many companies match: one main join, one batched sparkline
  query, one batched latest-volume query. No per-row round trips.
- GET /company/{symbol} (`get_company_by_symbol`) issues the same 3
  queries scoped to a single symbol — cheap by construction, and it's the
  one place allowed to return the full (eventually expensive, once
  Module 3 lands) object.
- Risk/return/horizon heuristics live in scoring_service.py, not here,
  since Module 4 and Module 9 will reuse them.
"""
from typing import Dict, List, Optional
from decimal import Decimal

from sqlalchemy import bindparam, text

from analysis.scoring_engine import compute_scores, verdict_for
from db.db import engine
from schemas.company import Company, CompanyListItem
from services.fundamental_service import (
    get_annual_comparison,
    get_quarterly_comparison,
    get_quarterly_financials,
    get_shareholding_trend,
)
from services.financial_statements_service import get_trend_signals, get_historical_pe_range
from services.shareholding_service import get_shareholding_summary
from services.scoring_service import (
    expected_return_and_horizon,
    research_checklist,
    risk_level,
    trend_label,
)
from services.technical_service import get_support_resistance

SPARK_POINTS = 14
VOLUME_BREAKOUT_MULTIPLE = 1.5


def _format_market_cap(cr: Optional[float]) -> str:
    """Indian-style market cap display: crores under 1,00,000 show as
    'X,XXX Cr'; at/above 1 lakh crore, show as 'X.XXL Cr'."""
    if cr is None:
        return "—"
    if cr >= 100_000:
        return f"₹{cr / 100_000:.2f}L Cr"
    return f"₹{cr:,.0f} Cr"


BASE_QUERY = """
    select
        c.symbol, c.exchange, c.name, c.sector,
        f.market_cap_cr, f.pe, f.pb, f.peg, f.roe_pct, f.roce_pct, f.eps,
        f.revenue_growth_pct, f.profit_growth_pct, f.dividend_yield_pct,
        f.current_ratio, f.book_value,
        de.debt_to_equity,
        sh.promoter_pct, sh.fii_pct, sh.dii_pct,
        t.close, t.change_pct, t.rsi_14, t.above_50dma, t.above_200dma,
        t.golden_cross, t.death_cross, t.avg_volume_20, t.high_52w, t.low_52w,
        s.verdict, s.rationale
    from companies c
    left join financials_quarterly f
        on f.symbol = c.symbol and f.quarter = 'latest'
    left join lateral (
        select debt_to_equity
        from financials_quarterly
        where symbol = c.symbol and debt_to_equity is not null
        order by fiscal_year_end desc nulls last
        limit 1
    ) de on true
    left join lateral (
        select promoter_pct, fii_pct, dii_pct
        from shareholding_pattern
        where symbol = c.symbol
        order by quarter desc
        limit 1
    ) sh on true
    left join technical_snapshot t on t.symbol = c.symbol
    left join scores s on s.symbol = c.symbol
"""

# --- Batched auxiliary lookups -------------------------------------------
# Both of these take a *list* of symbols and issue exactly one query,
# regardless of list size — this is what replaces the old per-company
# (N+1) helper calls.

_SPARK_QUERY = text(
    """
    select symbol, array_agg(close order by date asc) as spark
    from (
        select symbol, close, date,
               row_number() over (partition by symbol order by date desc) as rn
        from prices_daily
        where symbol in :symbols
    ) ranked
    where rn <= :n
    group by symbol
    """
).bindparams(bindparam("symbols", expanding=True))

_LATEST_VOLUME_QUERY = text(
    """
    select distinct on (symbol) symbol, volume
    from prices_daily
    where symbol in :symbols
    order by symbol, date desc
    """
).bindparams(bindparam("symbols", expanding=True))

# Peer-average P/E per sector, for the scoring engine's sector-relative
# P/E metric (analysis/scoring_engine._score_pe). One query for the
# whole universe regardless of how many companies are being scored —
# same query ingest/compute_scores.py runs for the batch-persisted
# `scores` table, so the live and batch numbers compare against the
# same peer set. `having count(*) >= 2` avoids a "sector average" of
# one company comparing against itself.
_SECTOR_AVG_PE_QUERY = text(
    """
    select c.sector, avg(f.pe) as avg_pe
    from companies c
    join financials_quarterly f
        on f.symbol = c.symbol and f.quarter = 'latest'
    where c.is_active and f.pe is not null and f.pe > 0
    group by c.sector
    having count(*) >= 2
    """
)


import time

_SECTOR_AVG_PE_CACHE: Dict[str, tuple] = {}
_SECTOR_PERCENTILES_CACHE: Dict[str, tuple] = {}
_SECTOR_CACHE_TTL = 300.0  # 5 minutes


def _fetch_sector_avg_pe(conn) -> Dict[str, float]:
    now = time.monotonic()
    if "data" in _SECTOR_AVG_PE_CACHE:
        ts, data = _SECTOR_AVG_PE_CACHE["data"]
        if now - ts < _SECTOR_CACHE_TTL:
            return data
    rows = conn.execute(_SECTOR_AVG_PE_QUERY).mappings().all()
    data = {row["sector"]: float(row["avg_pe"]) for row in rows}
    _SECTOR_AVG_PE_CACHE["data"] = (now, data)
    return data


# ---------------------------------------------------------------------------
# Sprint 3 (v2): Sector-Relative Percentiles for ROE, ROCE, and D/E
# One universe-wide query, same approach as _fetch_sector_avg_pe. Returns
# a dict keyed by symbol: {symbol: {roePercentile, rocePercentile, dePercentile}}.
# Only sectors with >= 3 priced active peers are included — a thinner sector
# can't support a meaningful percentile rank. Results are pre-computed per
# universe run and looked up per company, not computed per-symbol.
# ---------------------------------------------------------------------------

_SECTOR_PEER_STATS_QUERY = text(
    """
    with universe as (
        select c.symbol, c.sector,
               f.roe_pct, f.roce_pct,
               d.debt_to_equity
        from companies c
        join financials_quarterly f
            on f.symbol = c.symbol and f.quarter = 'latest'
        left join lateral (
            select debt_to_equity
            from financials_quarterly
            where symbol = c.symbol and debt_to_equity is not null
            order by fiscal_year_end desc nulls last
            limit 1
        ) d on true
        where c.is_active
    ),
    sector_counts as (
        select sector, count(*) as n
        from universe
        group by sector
        having count(*) >= 3
    )
    select u.symbol, u.sector,
           u.roe_pct, u.roce_pct, u.debt_to_equity
    from universe u
    join sector_counts sc on sc.sector = u.sector
    """
)


def _compute_sector_percentiles(conn) -> Dict[str, Dict[str, Optional[float]]]:
    """Returns {symbol: {sectorRoePercentile, sectorRocePercentile, sectorDePercentile}}.
    For each metric the percentile is computed against same-sector peers only.
    D/E percentile is inverted (lower D/E = higher percentile = better)."""
    now = time.monotonic()
    if "data" in _SECTOR_PERCENTILES_CACHE:
        ts, data = _SECTOR_PERCENTILES_CACHE["data"]
        if now - ts < _SECTOR_CACHE_TTL:
            return data

    rows = conn.execute(_SECTOR_PEER_STATS_QUERY).mappings().all()
    if not rows:
        return {}

    # Group by sector
    from collections import defaultdict
    by_sector: Dict[str, list] = defaultdict(list)
    for row in rows:
        by_sector[row["sector"]].append(dict(row))

    result: Dict[str, Dict[str, Optional[float]]] = {}

    for sector, peers in by_sector.items():
        # Build sorted lists for each metric (None values excluded from the rank)
        roe_vals = sorted(
            [(p["symbol"], float(p["roe_pct"])) for p in peers if p["roe_pct"] is not None],
            key=lambda x: x[1]
        )
        roce_vals = sorted(
            [(p["symbol"], float(p["roce_pct"])) for p in peers if p["roce_pct"] is not None],
            key=lambda x: x[1]
        )
        # D/E: lower is better, so we sort ascending and INVERT the rank
        de_vals = sorted(
            [(p["symbol"], float(p["debt_to_equity"])) for p in peers if p["debt_to_equity"] is not None],
            key=lambda x: x[1]
        )

        def _percentile_rank(sym: str, ranked: list) -> Optional[float]:
            if not ranked:
                return None
            for i, (s, _) in enumerate(ranked):
                if s == sym:
                    # (i+0.5)/n * 100 gives the mid-point percentile
                    return round((i + 0.5) / len(ranked) * 100, 1)
            return None

        def _inv_percentile_rank(sym: str, ranked: list) -> Optional[float]:
            """Invert: symbol with lowest value (best D/E) gets 100th percentile."""
            p = _percentile_rank(sym, ranked)
            return round(100 - p, 1) if p is not None else None

        for p in peers:
            sym = p["symbol"]
            result[sym] = {
                "sectorRoePercentile": _percentile_rank(sym, roe_vals),
                "sectorRocePercentile": _percentile_rank(sym, roce_vals),
                "sectorDePercentile": _inv_percentile_rank(sym, de_vals),
            }

    _SECTOR_PERCENTILES_CACHE["data"] = (now, result)
    return result


# ---------------------------------------------------------------------------
# Sprint 3 (v2): FII/DII Institutional Trend
# Batched query for the whole symbol list — returns {symbol: (fii_trend, dii_trend)}
# where trend is the percentage-point change from previous to latest quarter.
# None for either means only one quarter of data exists (no diff possible).
# ---------------------------------------------------------------------------

_FII_DII_TREND_QUERY = text(
    """
    with ranked as (
        select symbol, fii_pct, dii_pct,
               row_number() over (partition by symbol order by period_end desc nulls last, quarter desc) as rn
        from shareholding_pattern
        where symbol in :symbols
    )
    select symbol,
           max(case when rn = 1 then fii_pct end) as fii_latest,
           max(case when rn = 2 then fii_pct end) as fii_prev,
           max(case when rn = 1 then dii_pct end) as dii_latest,
           max(case when rn = 2 then dii_pct end) as dii_prev
    from ranked
    where rn <= 2
    group by symbol
    """
).bindparams(bindparam("symbols", expanding=True))


def _fetch_fii_dii_trend_batch(conn, symbols: List[str]) -> Dict[str, Dict[str, Optional[float]]]:
    """Returns {symbol: {fiiTrendPct: float|None, diiTrendPct: float|None}}."""
    if not symbols:
        return {}
    rows = conn.execute(_FII_DII_TREND_QUERY, {"symbols": symbols}).mappings().all()
    out: Dict[str, Dict[str, Optional[float]]] = {}
    for row in rows:
        fii_t = (
            round(float(row["fii_latest"]) - float(row["fii_prev"]), 4)
            if row["fii_latest"] is not None and row["fii_prev"] is not None
            else None
        )
        dii_t = (
            round(float(row["dii_latest"]) - float(row["dii_prev"]), 4)
            if row["dii_latest"] is not None and row["dii_prev"] is not None
            else None
        )
        out[row["symbol"]] = {"fiiTrendPct": fii_t, "diiTrendPct": dii_t}
    return out


# ---------------------------------------------------------------------------
# Sprint 3 (v2): Earnings Quality from financial_statements
# Uses the same _linear_direction logic already in financial_statements_service
# — imported here rather than duplicated.
# ---------------------------------------------------------------------------

_EARNINGS_QUALITY_BATCH_QUERY = text(
    """
    select symbol, net_profit_cr
    from (
        select symbol, net_profit_cr,
               row_number() over (partition by symbol order by period_end desc) as rn
        from financial_statements
        where symbol in :symbols and period_type = 'quarterly'
          and net_profit_cr is not null
    ) ranked
    where rn <= 8
    order by symbol, rn asc
    """
).bindparams(bindparam("symbols", expanding=True))


def _fetch_earnings_quality_batch(conn, symbols: List[str]) -> Dict[str, Optional[Dict]]:
    """Batched earnings quality lookup across all requested symbols in one query.
    Replaces the N-query loop with a single window-ranked query."""
    if not symbols:
        return {}
    rows = conn.execute(_EARNINGS_QUALITY_BATCH_QUERY, {"symbols": symbols}).mappings().all()
    by_symbol: Dict[str, list] = {s: [] for s in symbols}
    for r in rows:
        sym = r["symbol"]
        if sym in by_symbol:
            by_symbol[sym].append(float(r["net_profit_cr"]))

    from services.financial_statements_service import _linear_direction

    out: Dict[str, Optional[Dict]] = {}
    for sym, values in by_symbol.items():
        n = len(values)
        if n < 2:
            out[sym] = None
            continue

        direction = _linear_direction(values)
        overall_slope = values[0] - values[-1]
        pairs = [(values[i] - values[i + 1]) for i in range(n - 1)]
        if overall_slope >= 0:
            matching = sum(1 for d in pairs if d >= 0)
        else:
            matching = sum(1 for d in pairs if d < 0)
        consistency_score = round(matching / len(pairs), 3) if pairs else 0.0

        out[sym] = {
            "direction": direction,
            "consistency_score": consistency_score,
            "n_periods": n,
            "profit_series": values,
        }
    return out


def _compute_earnings_quality(conn, symbol: str) -> Optional[Dict]:
    """Single-symbol convenience wrapper around _fetch_earnings_quality_batch."""
    return _fetch_earnings_quality_batch(conn, [symbol.upper()]).get(symbol.upper())


def _fetch_spark_batch(conn, symbols: List[str], n: int = SPARK_POINTS) -> Dict[str, list]:
    if not symbols:
        return {}
    rows = conn.execute(_SPARK_QUERY, {"symbols": symbols, "n": n}).mappings().all()
    return {row["symbol"]: [float(v) for v in row["spark"]] for row in rows}


def _fetch_latest_volume_batch(conn, symbols: List[str]) -> Dict[str, int]:
    if not symbols:
        return {}
    rows = conn.execute(_LATEST_VOLUME_QUERY, {"symbols": symbols}).mappings().all()
    return {row["symbol"]: int(row["volume"]) for row in rows if row["volume"] is not None}


def _company_fields(row, spark: list, latest_volume: Optional[int],
                    sector_avg_pe: Optional[float],
                    sector_percentiles: Optional[Dict] = None,
                    fii_dii_trend: Optional[Dict] = None,
                    earnings_quality: Optional[Dict] = None) -> dict:
    """Pure — no I/O. Builds the shared CompanyBase field dict from an
    already-fetched DB row plus already-batched spark/volume/sector-PE
    lookups.

    Sprint 3 additions: sector_percentiles, fii_dii_trend, earnings_quality
    are pre-fetched by the caller (batched for the list path, per-symbol
    for the detail path) and passed in here — this function stays pure.

    Scores are computed live by analysis.scoring_engine, not read off
    the `scores` table — see that module's docstring for why: it's the
    same engine ingest/compute_scores.py uses to populate `scores` (so
    SQL-level sorting in Discover/Screener stays close to these
    numbers), but computing it here, on the same request that already
    fetched every underlying field, is what guarantees the score shown
    on a company card and the "Why this score?" breakdown on its detail
    page can never disagree.
    """
    symbol = row["symbol"]

    debt_to_equity = row["debt_to_equity"]
    roe = row["roe_pct"]
    risk = risk_level(debt_to_equity, roe, sector=row["sector"])

    avg_volume_20 = row["avg_volume_20"]
    volume_breakout = bool(
        latest_volume is not None
        and avg_volume_20
        and latest_volume > VOLUME_BREAKOUT_MULTIPLE * avg_volume_20
    )

    score_result = compute_scores(
        {
            "roe": float(roe) if roe is not None else None,
            "roce": float(row["roce_pct"]) if row["roce_pct"] is not None else None,
            "salesGrowthPct": float(row["revenue_growth_pct"]) if row["revenue_growth_pct"] is not None else None,
            "profitGrowthPct": float(row["profit_growth_pct"]) if row["profit_growth_pct"] is not None else None,
            "debtToEquity": float(debt_to_equity) if debt_to_equity is not None else None,
            "currentRatio": float(row["current_ratio"]) if row["current_ratio"] is not None else None,
            "pe": float(row["pe"]) if row["pe"] is not None else None,
            "pb": float(row["pb"]) if row["pb"] is not None else None,
            "peg": float(row["peg"]) if row["peg"] is not None else None,
            "sectorAvgPe": sector_avg_pe,
            "divYield": float(row["dividend_yield_pct"]) if row["dividend_yield_pct"] is not None else None,
            "promoterHoldingPct": float(row["promoter_pct"]) if row["promoter_pct"] is not None else None,
            # Sprint 3 (v2) additions:
            "earningsQuality": earnings_quality,
            "fiiTrendPct": (fii_dii_trend or {}).get("fiiTrendPct"),
            "diiTrendPct": (fii_dii_trend or {}).get("diiTrendPct"),
            "sectorRoePercentile": (sector_percentiles or {}).get("sectorRoePercentile"),
            "sectorRocePercentile": (sector_percentiles or {}).get("sectorRocePercentile"),
            "sectorDePercentile": (sector_percentiles or {}).get("sectorDePercentile"),
            # Technical inputs (unchanged):
            "rsi": float(row["rsi_14"]) if row["rsi_14"] is not None else None,
            "aboveEma50": row["above_50dma"],
            "aboveEma200": row["above_200dma"],
            "goldenCross": row["golden_cross"],
            "deathCross": row["death_cross"],
            "volumeBreakout": volume_breakout,
            "price": float(row["close"]) if row["close"] is not None else None,
            "high52w": float(row["high_52w"]) if row["high_52w"] is not None else None,
            "low52w": float(row["low_52w"]) if row["low_52w"] is not None else None,
        }
    )
    overall_score = score_result["overallScore"]
    expected_return, horizon = expected_return_and_horizon(risk, overall_score)

    market_cap_cr = row["market_cap_cr"]

    return dict(
        symbol=symbol,
        exchange=row["exchange"] or "NSE",
        name=row["name"],
        sector=row["sector"] or "Unclassified",
        marketCap=_format_market_cap(market_cap_cr),
        marketCapCr=market_cap_cr or 0.0,
        price=row["close"] or 0.0,
        changePct=row["change_pct"] or 0.0,
        pe=row["pe"] or 0.0,
        pb=row["pb"] or 0.0,
        peg=row["peg"] or 0.0,
        roe=roe or 0.0,
        roce=row["roce_pct"] or 0.0,
        eps=row["eps"] or 0.0,
        # No dedicated EPS-growth column in the schema — proxying with
        # profit growth. See API_CONTRACT.md "Known approximations".
        epsGrowthPct=row["profit_growth_pct"] or 0.0,
        salesGrowthPct=row["revenue_growth_pct"] or 0.0,
        profitGrowthPct=row["profit_growth_pct"] or 0.0,
        debtToEquity=debt_to_equity or 0.0,
        currentRatio=row["current_ratio"] or 0.0,
        divYield=row["dividend_yield_pct"] or 0.0,
        promoterHoldingPct=row["promoter_pct"] or 0.0,
        fiiHoldingPct=row["fii_pct"] or 0.0,
        diiHoldingPct=row["dii_pct"] or 0.0,
        rsi=row["rsi_14"] or 0.0,
        aboveEma200=bool(row["above_200dma"]),
        aboveEma50=bool(row["above_50dma"]),
        goldenCross=bool(row["golden_cross"]),
        deathCross=bool(row["death_cross"]),
        volumeBreakout=volume_breakout,
        trend=trend_label(row["above_50dma"], row["above_200dma"]),
        fundamentalScore=score_result["fundamentalScore"],
        technicalScore=score_result["technicalScore"],
        overallScore=overall_score,
        weighting=score_result["weighting"],
        scoreBreakdown=score_result["scoreBreakdown"],
        riskLevel=risk,
        expectedReturnPct=expected_return,
        investmentHorizonMonths=horizon,
        verdict=verdict_for(overall_score),
        rationale=row["rationale"] or f"{symbol}: not enough data yet to generate a rationale.",
        spark=spark,
    )


def _valuation_metrics(fields: dict, row) -> dict:
    """Research page's Valuation Cards. Reuses fields already computed
    by `_company_fields` for this same row — no duplicate calculation,
    no extra query.

    - marketCap/pe/pb/peg/divYield: straight reuse of existing fields.
      `or None` (not `or 0.0`) so a genuinely missing value renders as
      N/A instead of a misleading 0.
    - bookValuePerShare: newly exposed from financials_quarterly.book_value
      (already in the DB, just never selected/returned before this).
    - sharesOutstanding: derived as marketCapCr*1e7 / price — both
      already-fetched values, standard algebra, not a new data source.
    - freeFloatPct: approximated as 100 - promoter holding % (the
      common proxy — free float = non-promoter shareholding). An
      approximation, not a true free-float figure (which would also
      exclude government/strategic holders the schema doesn't track).
    - enterpriseValueCr/forwardPe/evEbitda/beta: genuinely unavailable —
      no absolute debt/cash, forward-earnings estimate, or benchmark
      price series exists anywhere in the schema, so these stay None
      (N/A) rather than being invented.
    """
    market_cap_cr = fields.get("marketCapCr") or None
    price = fields.get("price") or None
    shares_outstanding = (
    float(market_cap_cr) * 10_000_000 / float(price)
    if market_cap_cr is not None and price not in (None, 0)
    else None
)

    promoter = fields.get("promoterHoldingPct")
    free_float_pct = (100 - promoter) if promoter else None

    book_value = row["book_value"]

    return dict(
        marketCap=fields.get("marketCap"),
        marketCapCr=market_cap_cr,
        enterpriseValueCr=None,
        pe=fields.get("pe") or None,
        forwardPe=None,
        peg=fields.get("peg") or None,
        pb=fields.get("pb") or None,
        evEbitda=None,
        divYield=fields.get("divYield") or None,
        beta=None,
        sharesOutstanding=shares_outstanding,
        freeFloatPct=free_float_pct,
        bookValuePerShare=float(book_value) if book_value is not None else None,
    )


_ALL_COMPANIES_CACHE: Dict[str, tuple] = {}
_ALL_COMPANIES_CACHE_TTL = 180.0  # 3 minutes


def get_all_companies(
    search: Optional[str] = None,
    limit: int = 500,
    symbols: Optional[List[str]] = None,
) -> List[dict]:
    """GET /companies — lightweight list shape (CompanyListItem).
    Query count: fixed batched queries total, no per-row round trips."""
    if symbols is not None and len(symbols) == 0:
        return []

    now = time.monotonic()
    if not search and not symbols and limit >= 500:
        if "data" in _ALL_COMPANIES_CACHE:
            ts, cached_data = _ALL_COMPANIES_CACHE["data"]
            if now - ts < _ALL_COMPANIES_CACHE_TTL:
                return cached_data[:limit]

    params = {"limit": limit}
    where_parts = ["c.is_active"]
    if search:
        where_parts.append("(c.name ilike :search or c.symbol ilike :search)")
        params["search"] = f"%{search}%"
    if symbols:
        where_parts.append("c.symbol in :symbols_filter")
        params["symbols_filter"] = [s.upper() for s in symbols]

    where = "where " + " and ".join(where_parts)
    query_str = f"{BASE_QUERY} {where} order by c.name limit :limit"
    if symbols:
        query = text(query_str).bindparams(bindparam("symbols_filter", expanding=True))
    else:
        query = text(query_str)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()
        symbols_found = [row["symbol"] for row in rows]

        spark_by_symbol = _fetch_spark_batch(conn, symbols_found)
        volume_by_symbol = _fetch_latest_volume_batch(conn, symbols_found)
        sector_avg_pe_by_sector = _fetch_sector_avg_pe(conn)
        # Sprint 3: universe-wide sector percentile ranks (cached in-memory)
        sector_pct_by_symbol = _compute_sector_percentiles(conn)
        # Sprint 3: FII/DII trend (batched, one query for all symbols)
        fii_dii_by_symbol = _fetch_fii_dii_trend_batch(conn, symbols_found)
        # Sprint 3: Earnings quality — single batched query across all symbols
        eq_by_symbol = _fetch_earnings_quality_batch(conn, symbols_found)

        items = [
            CompanyListItem(
                **_company_fields(
                    row,
                    spark_by_symbol.get(row["symbol"], []),
                    volume_by_symbol.get(row["symbol"]),
                    sector_avg_pe_by_sector.get(row["sector"]),
                    sector_percentiles=sector_pct_by_symbol.get(row["symbol"]),
                    fii_dii_trend=fii_dii_by_symbol.get(row["symbol"]),
                    earnings_quality=eq_by_symbol.get(row["symbol"]),
                )
            ).model_dump()
            for row in rows
        ]

        if not search and not symbols and limit >= 500:
            _ALL_COMPANIES_CACHE["data"] = (now, items)

        return items


def get_company_by_symbol(symbol: str) -> Optional[dict]:
    """GET /company/{symbol} — the complete object (Company), including
    the deep-research fields Module 3 will fill in. Scoped to one symbol,
    so the same batched helpers are cheap here too (single-element list)."""
    query = text(f"{BASE_QUERY} where c.symbol = :symbol")

    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol.upper()}).mappings().first()
        if row is None:
            return None

        symbols = [row["symbol"]]
        spark = _fetch_spark_batch(conn, symbols).get(row["symbol"], [])
        latest_volume = _fetch_latest_volume_batch(conn, symbols).get(row["symbol"])
        sector_avg_pe = _fetch_sector_avg_pe(conn).get(row["sector"])
        # Sprint 3: sector percentiles (universe-wide, single query)
        sector_pct = _compute_sector_percentiles(conn).get(row["symbol"])
        # Sprint 3: FII/DII trend (single-symbol, same query)
        fii_dii = _fetch_fii_dii_trend_batch(conn, symbols).get(row["symbol"])
        # Sprint 3: Earnings quality (single-symbol)
        eq = _compute_earnings_quality(conn, row["symbol"])

        fields = _company_fields(
            row, spark, latest_volume, sector_avg_pe,
            sector_percentiles=sector_pct,
            fii_dii_trend=fii_dii,
            earnings_quality=eq,
        )
        symbol_upper = row["symbol"]

        # Deep-research fields (Module 3 + the Bloomberg/TIKR redesign).
        # Rule-based derivations (checklist) reuse the fields already
        # computed above — no extra queries. History-backed fields
        # (shareholdingTrend/quarterlyFinancials/quarterlyComparison/
        # annualComparison) each cost one more query, scoped to this
        # single symbol — see fundamental_service.py. valuation reuses
        # `fields`/`row` with no extra query — see
        # company_service._valuation_metrics. supportResistance costs
        # two more small single-symbol queries — see
        # technical_service.get_support_resistance.
        fields["checklist"] = research_checklist(fields)
        fields["shareholdingTrend"] = get_shareholding_trend(symbol_upper)
        fields["shareholdingSummary"] = get_shareholding_summary(symbol_upper)
        fields["quarterlyFinancials"] = get_quarterly_financials(symbol_upper)
        fields["valuation"] = _valuation_metrics(fields, row)
        fields["supportResistance"] = get_support_resistance(symbol_upper)
        fields["quarterlyComparison"] = get_quarterly_comparison(symbol_upper)
        fields["annualComparison"] = get_annual_comparison(symbol_upper)
        fields["trendSignals"] = get_trend_signals(symbol_upper)
        fields["historicalPeRange"] = get_historical_pe_range(
            symbol_upper, fields.get("pe") or None
        )

        return Company(**fields).model_dump()

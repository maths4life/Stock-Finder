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

from db.db import engine
from schemas.company import Company, CompanyListItem
from services.fundamental_service import (
    get_annual_comparison,
    get_quarterly_comparison,
    get_quarterly_financials,
    get_shareholding_trend,
)
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
        t.golden_cross, t.avg_volume_20,
        s.fundamental_score, s.technical_score, s.overall_score,
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


def _company_fields(row, spark: list, latest_volume: Optional[int]) -> dict:
    """Pure — no I/O. Builds the shared CompanyBase field dict from an
    already-fetched DB row plus already-batched spark/volume lookups."""
    symbol = row["symbol"]

    debt_to_equity = row["debt_to_equity"]
    roe = row["roe_pct"]
    risk = risk_level(debt_to_equity, roe)
    overall_score = row["overall_score"]
    expected_return, horizon = expected_return_and_horizon(risk, overall_score)

    avg_volume_20 = row["avg_volume_20"]
    volume_breakout = bool(
        latest_volume is not None
        and avg_volume_20
        and latest_volume > VOLUME_BREAKOUT_MULTIPLE * avg_volume_20
    )

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
        volumeBreakout=volume_breakout,
        trend=trend_label(row["above_50dma"], row["above_200dma"]),
        fundamentalScore=row["fundamental_score"] or 0.0,
        technicalScore=row["technical_score"] or 0.0,
        overallScore=overall_score or 0.0,
        riskLevel=risk,
        expectedReturnPct=expected_return,
        investmentHorizonMonths=horizon,
        verdict=row["verdict"] or "Under Review",
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


def get_all_companies(search: Optional[str] = None, limit: int = 500) -> List[dict]:
    """GET /companies — lightweight list shape (CompanyListItem). Exactly
    3 DB round trips total, independent of result size."""
    # Milestone 5: companies.is_active is now genuinely populated (kept in
    # sync with the universe CSV by ensure_company_rows in
    # ingest/fetch_prices.py) rather than an unused default-true column, so
    # it's meaningful to filter on here. A company that leaves the tracked
    # universe (e.g. dropped from Nifty 50/Next 50 at a rebalance) is never
    # deleted — its historical price/fundamentals/journal data stays intact
    # — but it stops appearing in Discover/Search/Screener once flipped to
    # is_active = false. get_company_by_symbol (below) deliberately has no
    # such filter, so a direct lookup — e.g. from an existing journal entry
    # or pipeline item that points at a symbol which has since left the
    # universe — still resolves instead of 404ing.
    where = "where c.is_active"
    params = {"limit": limit}
    if search:
        where += " and (c.name ilike :search or c.symbol ilike :search)"
        params["search"] = f"%{search}%"

    query = text(f"{BASE_QUERY} {where} order by c.name limit :limit")

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()
        symbols = [row["symbol"] for row in rows]

        spark_by_symbol = _fetch_spark_batch(conn, symbols)
        volume_by_symbol = _fetch_latest_volume_batch(conn, symbols)

        return [
            CompanyListItem(
                **_company_fields(
                    row,
                    spark_by_symbol.get(row["symbol"], []),
                    volume_by_symbol.get(row["symbol"]),
                )
            ).model_dump()
            for row in rows
        ]


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

        fields = _company_fields(row, spark, latest_volume)
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
        fields["quarterlyFinancials"] = get_quarterly_financials(symbol_upper)
        fields["valuation"] = _valuation_metrics(fields, row)
        fields["supportResistance"] = get_support_resistance(symbol_upper)
        fields["quarterlyComparison"] = get_quarterly_comparison(symbol_upper)
        fields["annualComparison"] = get_annual_comparison(symbol_upper)

        return Company(**fields).model_dump()

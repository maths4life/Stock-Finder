import { ApiError } from "@/shared/api/client";
import type {
  Company,
  CompanyQueryParams,
  Paginated,
  PriceBar,
  PriceRange,
} from "@/shared/api/types";
import { companyRecords } from "@/features/company/api/mock/companies.data";
import { UNIVERSE_MAP } from "@/features/company/data/universe";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// In-memory cache of companies seen so far (from API or mock)
const knownCompanies = new Map<string, Company>();

// Seed with default mock records
for (const [s, c] of Object.entries(companyRecords)) {
  knownCompanies.set(s.toUpperCase(), c);
}

function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getMockCompany(symbol: string): Company {
  const sym = symbol.toUpperCase();

  // 1. If we have a dedicated handwritten mock entry in companyRecords, use it
  if (companyRecords[sym]) {
    return companyRecords[sym];
  }

  // 2. Check if we have an entry in our in-memory cache
  const cached = knownCompanies.get(sym);

  // 3. Look up universe mapping for real company metadata
  const uni = UNIVERSE_MAP[sym];
  const name = cached?.name || uni?.name || `${sym} Ltd.`;
  const sector = cached?.sector || uni?.sector || "Diversified";
  const exchange = cached?.exchange || uni?.exchange || "NSE";

  // Deterministic attributes derived from symbol hash
  const h = hashSymbol(sym);
  const basePrice = cached?.price || (h % 3000) + 50;
  const price = Number(basePrice.toFixed(2));
  const changePct = cached?.changePct ?? Number((((h % 600) - 280) / 100).toFixed(2));
  const marketCapCr = cached?.marketCapCr || (h % 150000) + 1200;
  const marketCapStr =
    cached?.marketCap ||
    (marketCapCr >= 100000
      ? `₹${(marketCapCr / 100000).toFixed(2)}L Cr`
      : `₹${marketCapCr.toLocaleString("en-IN")} Cr`);

  const pe = cached?.pe ?? Number(((h % 35) + 14).toFixed(1));
  const pb = cached?.pb ?? Number(((h % 60) / 10 + 1.5).toFixed(1));
  const roe = cached?.roe ?? Number(((h % 160) / 10 + 12).toFixed(1));
  const roce = cached?.roce ?? Number((roe * 1.18).toFixed(1));
  const debtToEquity = cached?.debtToEquity ?? Number(((h % 60) / 100).toFixed(2));
  const divYield = cached?.divYield ?? Number(((h % 22) / 10).toFixed(2));
  const promoterHolding = cached?.promoterHoldingPct ?? Number(((h % 25) + 48).toFixed(1));
  const fiiHolding = cached?.fiiHoldingPct ?? Number(((h % 16) + 12).toFixed(1));
  const diiHolding = cached?.diiHoldingPct ?? Number(((h % 14) + 8).toFixed(1));
  const overallScore = cached?.overallScore ?? (h % 30) + 65;
  const fundamentalScore = cached?.fundamentalScore ?? (h % 25) + 70;
  const technicalScore = cached?.technicalScore ?? (h % 25) + 60;
  const trend = cached?.trend ?? (changePct >= 0 ? "Uptrend" : "Sideways");
  const isFinancial = /financial|bank|nbfc|insurance|housing/i.test(sector);
  const riskLevel =
    cached?.riskLevel ??
    (isFinancial
      ? roe > 14
        ? "Low"
        : "Moderate"
      : debtToEquity > 0.8
        ? "High"
        : debtToEquity < 0.3
          ? "Low"
          : "Moderate");

  // Proportional financials scaled to company scale
  const revCr = Math.round(marketCapCr * 0.26);
  const prevRevCr = Math.round(revCr * 0.91);
  const patCr = Math.round(revCr * 0.092);
  const prevPatCr = Math.round(patCr * 0.86);

  const quarterlyComparison = {
    currentLabel: "Q3FY25",
    previousLabel: "Q2FY25",
    rows: [
      { metric: "Revenue (Cr)", current: revCr, previous: prevRevCr, diff: revCr - prevRevCr, growthPct: 9.89 },
      { metric: "Net Profit (Cr)", current: patCr, previous: prevPatCr, diff: patCr - prevPatCr, growthPct: 13.95 },
      { metric: "EBITDA Margin (%)", current: 14.5, previous: 13.4, diff: 1.1, growthPct: 8.21 },
      {
        metric: "Operating Expenses (Cr)",
        current: Math.round(revCr * 0.81),
        previous: Math.round(prevRevCr * 0.82),
        diff: Math.round(revCr * 0.81 - prevRevCr * 0.82),
        growthPct: 8.54,
      },
    ],
  };

  const annualRevCr = Math.round(revCr * 3.85);
  const prevAnnualRevCr = Math.round(annualRevCr * 0.86);
  const annualPatCr = Math.round(patCr * 3.9);
  const prevAnnualPatCr = Math.round(annualPatCr * 0.83);

  const annualComparison = {
    currentLabel: "FY24",
    previousLabel: "FY23",
    rows: [
      { metric: "Revenue (Cr)", current: annualRevCr, previous: prevAnnualRevCr, diff: annualRevCr - prevAnnualRevCr, growthPct: 16.28 },
      { metric: "Net Profit (Cr)", current: annualPatCr, previous: prevAnnualPatCr, diff: annualPatCr - prevAnnualPatCr, growthPct: 20.48 },
      { metric: "Operating Margin (%)", current: 13.6, previous: 12.5, diff: 1.1, growthPct: 8.8 },
    ],
  };

  const quarterlyFinancials = [
    { quarter: "Q1FY25", revenueCr: Math.round(revCr * 0.89), netProfitCr: Math.round(patCr * 0.86), ebitdaMarginPct: 13.2 },
    { quarter: "Q2FY25", revenueCr: prevRevCr, netProfitCr: prevPatCr, ebitdaMarginPct: 13.4 },
    { quarter: "Q3FY25", revenueCr: revCr, netProfitCr: patCr, ebitdaMarginPct: 14.5 },
  ];

  const shareholdingTrend = [
    {
      quarter: "Q3FY25",
      promoter: promoterHolding,
      fii: fiiHolding,
      dii: diiHolding,
      public: Number((100 - promoterHolding - fiiHolding - diiHolding).toFixed(1)),
      mutualFunds: 6.2,
      government: 0.0,
      others: 2.1,
    },
    {
      quarter: "Q2FY25",
      promoter: promoterHolding,
      fii: Number((fiiHolding - 0.4).toFixed(1)),
      dii: Number((diiHolding - 0.2).toFixed(1)),
      public: Number((100 - promoterHolding - fiiHolding - diiHolding + 0.6).toFixed(1)),
      mutualFunds: 6.0,
      government: 0.0,
      others: 2.3,
    },
    {
      quarter: "Q1FY25",
      promoter: promoterHolding,
      fii: Number((fiiHolding - 0.7).toFixed(1)),
      dii: Number((diiHolding - 0.4).toFixed(1)),
      public: Number((100 - promoterHolding - fiiHolding - diiHolding + 1.1).toFixed(1)),
      mutualFunds: 5.8,
      government: 0.0,
      others: 2.5,
    },
  ];

  const created: Company = {
    symbol: sym,
    exchange,
    name,
    sector,
    price,
    changePct,
    marketCap: marketCapStr,
    marketCapCr,
    pe,
    pb,
    peg: 1.4,
    roe,
    roce,
    eps: Number((price / pe).toFixed(2)),
    epsGrowthPct: 16.5,
    salesGrowthPct: 15.4,
    profitGrowthPct: 18.2,
    debtToEquity,
    currentRatio: 1.8,
    divYield,
    promoterHoldingPct: promoterHolding,
    fiiHoldingPct: fiiHolding,
    diiHoldingPct: diiHolding,
    rsi: (h % 26) + 48,
    aboveEma50: changePct >= 0,
    aboveEma200: true,
    goldenCross: true,
    volumeBreakout: false,
    deathCross: false,
    trend,
    riskLevel,
    overallScore,
    fundamentalScore,
    technicalScore,
    expectedReturnPct: (h % 14) + 12,
    investmentHorizonMonths: 12,
    verdict: overallScore >= 75 ? "Strong Conviction" : overallScore >= 65 ? "Watch" : "Under Review",
    rationale: `Strong market presence in the Indian ${sector} space with disciplined capital allocation and positive earnings visibility.`,
    checklist: [
      { label: "Operating cash flow exceeds net profit (strong cash conversion)", done: true },
      { label: "Promoter pledge below 5% (unencumbered promoter equity)", done: true },
      {
        label: isFinancial
          ? "Adequate regulatory capital (CAR > 15%)"
          : `Debt to equity below 0.5x (current: ${debtToEquity})`,
        done: isFinancial ? true : debtToEquity < 0.5,
      },
      { label: `Industry secular growth tailwinds in ${sector}`, done: true },
      { label: `Reasonable historical valuation multiple (P/E: ${pe}x)`, done: pe < 42 },
    ],
    quarterlyFinancials: [
      { quarter: "Q3FY25", revenueCr: Math.round(marketCapCr * 0.08), netProfitCr: Math.round(marketCapCr * 0.01), ebitdaMarginPct: 14.5 },
      { quarter: "Q2FY25", revenueCr: Math.round(marketCapCr * 0.075), netProfitCr: Math.round(marketCapCr * 0.009), ebitdaMarginPct: 14.0 },
      { quarter: "Q1FY25", revenueCr: Math.round(marketCapCr * 0.072), netProfitCr: Math.round(marketCapCr * 0.008), ebitdaMarginPct: 13.8 },
      { quarter: "Q4FY24", revenueCr: Math.round(marketCapCr * 0.07), netProfitCr: Math.round(marketCapCr * 0.008), ebitdaMarginPct: 13.5 },
    ],
    shareholdingTrend,
    shareholdingSummary: {
      latestQuarter: "Q3FY25",
      previousQuarter: "Q2FY25",
      categories: [
        { category: "Promoter", latest: promoterHolding, previous: promoterHolding, changePct: 0.0 },
        { category: "FII", latest: fiiHolding, previous: Number((fiiHolding - 0.4).toFixed(1)), changePct: 0.4 },
        { category: "DII", latest: diiHolding, previous: Number((diiHolding - 0.2).toFixed(1)), changePct: 0.2 },
        {
          category: "Public",
          latest: Number((100 - promoterHolding - fiiHolding - diiHolding).toFixed(1)),
          previous: Number((100 - promoterHolding - fiiHolding - diiHolding + 0.6).toFixed(1)),
          changePct: -0.6,
        },
      ],
      source: "nse",
    },
    supportResistance: {
      pivot: Math.round(price * 0.99),
      support1: Math.round(price * 0.96),
      support2: Math.round(price * 0.93),
      resistance1: Math.round(price * 1.03),
      resistance2: Math.round(price * 1.06),
      vwap: Math.round(price * 0.995),
      high52w: Math.round(price * 1.28),
      low52w: Math.round(price * 0.68),
    },
    valuation: {
      marketCap: marketCapStr,
      marketCapCr,
      enterpriseValueCr: Math.round(marketCapCr * 1.02),
      pe,
      forwardPe: Number((pe * 0.88).toFixed(1)),
      peg: 1.4,
      pb,
      evEbitda: Number((pe * 0.68).toFixed(1)),
      divYield,
      beta: 0.92,
      sharesOutstanding: Math.round((marketCapCr * 10000000) / price),
      freeFloatPct: Number((100 - promoterHolding).toFixed(1)),
      bookValuePerShare: Number((price / pb).toFixed(1)),
    },
    quarterlyComparison,
    annualComparison,
    trendSignals: [
      { metric: "Revenue", direction: "Improving", delta: revCr - prevRevCr, unit: "Cr", series: [Math.round(revCr * 0.89), prevRevCr, revCr] },
      { metric: "EBITDA Margin", direction: "Improving", delta: 1.1, unit: "%", series: [13.2, 13.4, 14.5] },
      { metric: "Net Profit", direction: "Improving", delta: patCr - prevPatCr, unit: "Cr", series: [Math.round(patCr * 0.86), prevPatCr, patCr] },
    ],
    historicalPeRange: {
      pe_min: Number((pe * 0.65).toFixed(1)),
      pe_max: Number((pe * 1.45).toFixed(1)),
      pe_median: Number((pe * 0.95).toFixed(1)),
      current_pe: pe,
      percentile: 65,
      years: 5,
    },
    scoreBreakdown: {
      fundamental: [
        { metric: "RoE > 15%", value: roe, score: roe > 15 ? 15 : 8, maxScore: 15, passed: roe > 15, reason: `RoE of ${roe.toFixed(1)}% vs 15% quality threshold` },
        { metric: "ROCE > 18%", value: roce, score: roce > 18 ? 15 : 9, maxScore: 15, passed: roce > 18, reason: `ROCE of ${roce.toFixed(1)}% demonstrates capital efficiency` },
        isFinancial
          ? {
              metric: "Capital Structure (Financials)",
              value: "Compliant",
              score: 14,
              maxScore: 15,
              passed: true,
              reason: "Lending institution operating leverage within standard RBI capital adequacy guidelines",
            }
          : {
              metric: "Debt to Equity < 0.5",
              value: debtToEquity,
              score: debtToEquity < 0.5 ? 15 : 7,
              maxScore: 15,
              passed: debtToEquity < 0.5,
              reason: `D/E ratio of ${debtToEquity.toFixed(2)}`,
            },
        { metric: "Sales Growth > 12%", value: 15.4, score: 12, maxScore: 15, passed: true, reason: "Consistent double-digit topline expansion" },
        {
          metric: "Promoter Holding & Governance",
          value: `${promoterHolding.toFixed(1)}%`,
          score: 8,
          maxScore: 8,
          passed: true,
          reason: "Clean promoter shareholding with 0% promoter pledge",
        },
      ],
      technical: [
        { metric: "Above 50 DMA", value: changePct >= 0, score: changePct >= 0 ? 10 : 3, maxScore: 10, passed: changePct >= 0, reason: changePct >= 0 ? "Trading above 50-day moving average" : "Consolidating below 50 DMA" },
        { metric: "Above 200 DMA", value: true, score: 10, maxScore: 10, passed: true, reason: "Long-term trend positive above 200 DMA" },
        { metric: "RSI Momentum", value: (h % 26) + 48, score: 8, maxScore: 10, passed: true, reason: "RSI momentum comfortably in constructive range" },
      ],
    },
    spark: [45, 48, 47, 52, 50, 56, 58, 62, 60, 65, 68, 72, 70, 75],
  };

  knownCompanies.set(sym, created);
  return created;
}

function generateMockPrices(basePrice = 1000, days = 130): PriceBar[] {
  const bars: PriceBar[] = [];
  const now = new Date();
  let current = basePrice * 0.82;

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const change = (Math.random() - 0.48) * (current * 0.025);
    const open = current;
    const close = Math.max(10, current + change);
    const high = Math.max(open, close) + Math.random() * (current * 0.012);
    const low = Math.min(open, close) - Math.random() * (current * 0.012);
    const volume = Math.floor(80000 + Math.random() * 350000);
    const dateStr = d.toISOString().split("T")[0];

    bars.push({
      date: dateStr,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
    current = close;
  }
  return bars;
}

/**
 * GET /companies (Module 4 — Screener)
 */
export async function fetchCompanies(params: CompanyQueryParams = {}): Promise<Paginated<Company>> {
  const qs = new URLSearchParams();
  if (params.symbols) qs.set("symbols", params.symbols);
  if (params.search) qs.set("search", params.search);
  if (params.sector && params.sector !== "All") qs.set("sector", params.sector);
  if (params.riskLevel && params.riskLevel !== "Any") qs.set("riskLevel", params.riskLevel);
  if (params.horizon && params.horizon !== "Any") qs.set("horizon", params.horizon);
  if (params.minRoe) qs.set("minRoe", String(params.minRoe));
  if (params.maxRoe !== undefined) qs.set("maxRoe", String(params.maxRoe));
  if (params.minRoce) qs.set("minRoce", String(params.minRoce));
  if (params.maxRoce !== undefined) qs.set("maxRoce", String(params.maxRoce));
  if (params.minEpsGrowth) qs.set("minEpsGrowth", String(params.minEpsGrowth));
  if (params.maxEpsGrowth !== undefined) qs.set("maxEpsGrowth", String(params.maxEpsGrowth));
  if (params.minSalesGrowth) qs.set("minSalesGrowth", String(params.minSalesGrowth));
  if (params.maxSalesGrowth !== undefined) qs.set("maxSalesGrowth", String(params.maxSalesGrowth));
  if (params.minPe !== undefined) qs.set("minPe", String(params.minPe));
  if (params.maxPe !== undefined) qs.set("maxPe", String(params.maxPe));
  if (params.maxDebtToEquity !== undefined)
    qs.set("maxDebtToEquity", String(params.maxDebtToEquity));
  if (params.minPromoterHolding) qs.set("minPromoterHolding", String(params.minPromoterHolding));
  if (params.aboveEma200) qs.set("aboveEma200", "true");
  if (params.aboveEma50) qs.set("aboveEma50", "true");
  if (params.volumeBreakout) qs.set("volumeBreakout", "true");
  if (params.minMarketCap !== undefined) qs.set("minMarketCap", String(params.minMarketCap));
  if (params.maxMarketCap !== undefined) qs.set("maxMarketCap", String(params.maxMarketCap));
  if (params.sort) qs.set("sort", params.sort);
  if (params.sortDirection) qs.set("sortDirection", params.sortDirection);
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 20));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_URL}/companies?${qs.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: Paginated<Company> = await response.json();
      if (Array.isArray(data?.items)) {
        for (const item of data.items) {
          if (item?.symbol) {
            knownCompanies.set(item.symbol.toUpperCase(), item);
          }
        }
      }
      return data;
    }
  } catch {
    // Fallback to local mock / universe items
  }

  // Fallback handling when backend is offline
  if (params.symbols) {
    const syms = params.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const items = syms.map((s) => getMockCompany(s));
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
      totalPages: 1,
    };
  }

  if (params.search) {
    const q = params.search.trim().toLowerCase();
    const matchedSymbols = Object.keys(UNIVERSE_MAP).filter((sym) => {
      const meta = UNIVERSE_MAP[sym];
      return sym.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q);
    });
    const items = matchedSymbols.slice(0, params.pageSize ?? 20).map((s) => getMockCompany(s));
    return {
      items,
      total: matchedSymbols.length,
      page: 1,
      pageSize: params.pageSize ?? 20,
      totalPages: Math.ceil(matchedSymbols.length / (params.pageSize ?? 20)),
    };
  }

  const allItems = Object.values(companyRecords);
  return {
    items: allItems,
    total: allItems.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };
}

/**
 * GET /company/{symbol}
 */
export async function fetchCompany(symbol: string): Promise<Company> {
  const sym = symbol.toUpperCase();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_URL}/company/${sym}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      knownCompanies.set(sym, data);
      return data;
    }
  } catch {
    // Backend offline / network timeout fallback
  }

  return getMockCompany(sym);
}

/**
 * GET /company/{symbol}/prices — Module 3 Price History section.
 */
export async function fetchCompanyPrices(
  symbol: string,
  range: PriceRange = "6M",
): Promise<PriceBar[]> {
  const sym = symbol.toUpperCase();
  try {
    const qs = new URLSearchParams({ range });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_URL}/company/${sym}/prices?${qs.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1];
        if (latest?.close) {
          const cached = knownCompanies.get(sym);
          if (cached) {
            cached.price = latest.close;
          }
        }
        return data;
      }
    }
  } catch {
    // Backend offline / network timeout fallback
  }

  const comp = getMockCompany(sym);
  return generateMockPrices(comp.price);
}

/**
 * Used by search bar.
 */
export async function searchCompanies(query: string, limit = 8): Promise<Company[]> {
  const { items } = await fetchCompanies({ search: query, pageSize: limit });
  return items;
}

/**
 * Used for dropdowns.
 */
let allCompaniesCache: { promise: Promise<Company[]>; timestamp: number } | null = null;
const ALL_COMPANIES_TTL = 60 * 1000; // 1 minute

export async function fetchAllCompanies(): Promise<Company[]> {
  const now = Date.now();
  if (allCompaniesCache && now - allCompaniesCache.timestamp < ALL_COMPANIES_TTL) {
    return allCompaniesCache.promise;
  }
  const promise = fetchCompanies({ sort: "name", pageSize: 1000 })
    .then((res) => {
      for (const item of res.items) {
        if (item?.symbol) knownCompanies.set(item.symbol.toUpperCase(), item);
      }
      return res.items;
    })
    .catch((err) => {
      allCompaniesCache = null;
      throw err;
    });
  allCompaniesCache = { promise, timestamp: now };
  return promise;
}

/**
 * Used by watchlist/portfolio/discover groups.
 */
export async function fetchCompaniesBySymbols(symbols: string[]): Promise<Company[]> {
  if (!symbols || symbols.length === 0) return [];
  const { items } = await fetchCompanies({
    symbols: symbols.join(","),
    pageSize: Math.max(symbols.length, 20),
  });
  return items;
}

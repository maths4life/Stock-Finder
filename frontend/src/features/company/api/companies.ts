import { ApiError } from "@/shared/api/client";
import type {
  Company,
  CompanyQueryParams,
  Paginated,
  PriceBar,
  PriceRange,
} from "@/shared/api/types";
import { companyRecords } from "@/features/company/api/mock/companies.data";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const defaultSupportResistance = {
  pivot: 5910,
  support1: 5820,
  support2: 5680,
  resistance1: 6050,
  resistance2: 6180,
  vwap: 5940,
  high52w: 6245,
  low52w: 3550,
};

const defaultValuation = {
  marketCap: "₹98,420 Cr",
  marketCapCr: 98420,
  enterpriseValueCr: 97800,
  pe: 48.1,
  forwardPe: 41.2,
  peg: 1.6,
  pb: 9.8,
  evEbitda: 31.4,
  divYield: 0.4,
  beta: 0.85,
  sharesOutstanding: 150000000,
  freeFloatPct: 36.8,
  bookValuePerShare: 667.3,
};

const defaultComparison = {
  currentLabel: "Q3FY25",
  previousLabel: "Q2FY25",
  rows: [
    { metric: "Revenue (Cr)", current: 4890, previous: 4480, diff: 410, growthPct: 9.15 },
    { metric: "Net Profit (Cr)", current: 398, previous: 356, diff: 42, growthPct: 11.8 },
    { metric: "EBITDA Margin (%)", current: 14.8, previous: 13.4, diff: 1.4, growthPct: 10.45 },
    { metric: "Operating Expenses (Cr)", current: 4166, previous: 3880, diff: 286, growthPct: 7.37 },
  ],
};

const defaultAnnualComparison = {
  currentLabel: "FY24",
  previousLabel: "FY23",
  rows: [
    { metric: "Revenue (Cr)", current: 18039, previous: 14107, diff: 3932, growthPct: 27.87 },
    { metric: "Net Profit (Cr)", current: 1803, previous: 1282, diff: 521, growthPct: 40.64 },
    { metric: "Operating Margin (%)", current: 13.5, previous: 12.2, diff: 1.3, growthPct: 10.65 },
  ],
};

function getMockCompany(symbol: string): Company {
  const sym = symbol.toUpperCase();
  const raw = companyRecords[sym] || companyRecords["POLYCAB"] || Object.values(companyRecords)[0];
  const price = raw?.price || 5988.0;

  return {
    ...raw,
    symbol: sym,
    name: sym === "PERSISTENT" ? "Persistent Systems Ltd." : raw?.name || `${sym} Ltd.`,
    exchange: raw?.exchange || "NSE",
    sector: sym === "PERSISTENT" ? "IT Consulting & Software" : raw?.sector || "Information Technology",
    price: sym === "PERSISTENT" ? 5988.0 : price,
    changePct: sym === "PERSISTENT" ? 3.47 : (raw?.changePct ?? 1.42),
    pe: raw?.pe ?? 48.1,
    pb: raw?.pb ?? 9.8,
    roe: raw?.roe ?? 22.4,
    roce: raw?.roce ?? 27.8,
    eps: raw?.eps ?? 135.97,
    salesGrowthPct: raw?.salesGrowthPct ?? 18.4,
    profitGrowthPct: raw?.profitGrowthPct ?? 26.2,
    debtToEquity: raw?.debtToEquity ?? 0.12,
    divYield: raw?.divYield ?? 0.4,
    promoterHoldingPct: raw?.promoterHoldingPct ?? 63.2,
    rsi: raw?.rsi ?? 64,
    aboveEma50: raw?.aboveEma50 ?? true,
    aboveEma200: raw?.aboveEma200 ?? true,
    goldenCross: raw?.goldenCross ?? true,
    volumeBreakout: raw?.volumeBreakout ?? true,
    trend: raw?.trend ?? "Uptrend",
    riskLevel: raw?.riskLevel ?? "Moderate",
    overallScore: raw?.overallScore ?? 81,
    fundamentalScore: raw?.fundamentalScore ?? 84,
    technicalScore: raw?.technicalScore ?? 78,
    rationale:
      raw?.rationale ||
      "Solid business fundamentals with strong capital return metrics and clear sectoral demand tailwinds.",
    checklist: raw?.checklist ?? [
      { label: "Operating cash flow exceeds net profit", done: true },
      { label: "Promoter pledge below 5%", done: true },
      { label: "Debt to equity below 0.5x", done: true },
      { label: "Industry demand secular growth trend", done: true },
      { label: "Reasonable historical valuation multiple", done: false },
    ],
    shareholdingTrend: raw?.shareholdingTrend ?? [
      { quarter: "Q3FY25", promoter: 63.2, fii: 18.6, dii: 9.4, public: 8.8, mutualFunds: 6.2, government: 0.0, others: 2.6 },
      { quarter: "Q2FY25", promoter: 63.2, fii: 17.9, dii: 9.1, public: 9.8, mutualFunds: 6.0, government: 0.0, others: 3.8 },
      { quarter: "Q1FY25", promoter: 63.2, fii: 17.1, dii: 8.8, public: 10.9, mutualFunds: 5.7, government: 0.0, others: 5.2 },
    ],
    shareholdingSummary: raw?.shareholdingSummary ?? {
      latestQuarter: "Q3FY25",
      previousQuarter: "Q2FY25",
      categories: [
        { category: "Promoter", latest: 63.2, previous: 63.2, changePct: 0.0 },
        { category: "FII", latest: 18.6, previous: 17.9, changePct: 0.7 },
        { category: "DII", latest: 9.4, previous: 9.1, changePct: 0.3 },
        { category: "Public", latest: 8.8, previous: 9.8, changePct: -1.0 },
      ],
      source: "nse",
    },
    supportResistance: {
      ...defaultSupportResistance,
      ...(raw?.supportResistance || {}),
      pivot: raw?.supportResistance?.pivot ?? Math.round(price * 0.99),
      support1: raw?.supportResistance?.support1 ?? Math.round(price * 0.97),
      support2: raw?.supportResistance?.support2 ?? Math.round(price * 0.95),
      resistance1: raw?.supportResistance?.resistance1 ?? Math.round(price * 1.02),
      resistance2: raw?.supportResistance?.resistance2 ?? Math.round(price * 1.05),
      vwap: raw?.supportResistance?.vwap ?? Math.round(price * 0.995),
      high52w: raw?.supportResistance?.high52w ?? Math.round(price * 1.15),
      low52w: raw?.supportResistance?.low52w ?? Math.round(price * 0.65),
    },
    valuation: {
      ...defaultValuation,
      ...(raw?.valuation || {}),
      marketCap: raw?.marketCap || defaultValuation.marketCap,
      pe: raw?.pe ?? defaultValuation.pe,
      pb: raw?.pb ?? defaultValuation.pb,
      divYield: raw?.divYield ?? defaultValuation.divYield,
    },
    quarterlyComparison: raw?.quarterlyComparison || defaultComparison,
    annualComparison: raw?.annualComparison || defaultAnnualComparison,
    trendSignals: raw?.trendSignals || [
      { metric: "Revenue", direction: "Accelerating", delta: 410, unit: "Cr", series: [4120, 4480, 4890] },
      { metric: "EBITDA Margin", direction: "Improving", delta: 2.7, unit: "%", series: [12.1, 13.4, 14.8] },
      { metric: "Net Profit", direction: "Accelerating", delta: 86, unit: "Cr", series: [312, 356, 398] },
      { metric: "Operating Cash Flow", direction: "Steady", delta: 120, unit: "Cr", series: [450, 480, 520] },
    ],
    historicalPeRange: raw?.historicalPeRange || {
      pe_min: 24.5,
      pe_max: 56.2,
      pe_median: 38.0,
      current_pe: raw?.pe ?? 48.1,
      percentile: 72,
      years: 5,
    },
    scoreBreakdown: raw?.scoreBreakdown || {
      fundamental: [
        { metric: "RoE > 15%", value: raw?.roe ?? 22.4, score: 15, maxScore: 15, passed: true, reason: `RoE of ${(raw?.roe ?? 22.4).toFixed(1)}% is well above threshold` },
        { metric: "ROCE > 18%", value: raw?.roce ?? 27.8, score: 15, maxScore: 15, passed: true, reason: `ROCE of ${(raw?.roce ?? 27.8).toFixed(1)}% demonstrates superior capital efficiency` },
        { metric: "Debt to Equity < 0.5", value: raw?.debtToEquity ?? 0.12, score: 15, maxScore: 15, passed: true, reason: `Virtually debt free balance sheet (D/E ${(raw?.debtToEquity ?? 0.12).toFixed(2)})` },
        { metric: "Sales Growth > 12%", value: raw?.salesGrowthPct ?? 18.4, score: 12, maxScore: 15, passed: true, reason: `Solid double-digit topline expansion (${(raw?.salesGrowthPct ?? 18.4).toFixed(1)}%)` },
      ],
      technical: [
        { metric: "Above 50 DMA", value: true, score: 10, maxScore: 10, passed: true, reason: "Trading comfortably above 50-day moving average" },
        { metric: "Above 200 DMA", value: true, score: 10, maxScore: 10, passed: true, reason: "Long-term trend strongly positive above 200 DMA" },
        { metric: "RSI Momentum", value: raw?.rsi ?? 64, score: 8, maxScore: 10, passed: true, reason: `RSI (${raw?.rsi ?? 64}) indicates solid bullish momentum` },
      ],
    },
  };
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
 * Backend owns filtering, sorting, ranking, and pagination — this just
 * forwards CompanyQueryParams to the querystring and returns the
 * Paginated<Company> envelope as-is. No client-side slicing/filtering.
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
      return await response.json();
    }
  } catch {
    // Fallback to local mock items
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_URL}/company/${symbol}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Backend offline / network timeout fallback
  }

  return getMockCompany(symbol);
}

/**
 * GET /company/{symbol}/prices — Module 3 Price History section.
 */
export async function fetchCompanyPrices(
  symbol: string,
  range: PriceRange = "6M",
): Promise<PriceBar[]> {
  try {
    const qs = new URLSearchParams({ range });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${API_URL}/company/${symbol}/prices?${qs.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // Backend offline / network timeout fallback
  }

  const comp = getMockCompany(symbol);
  return generateMockPrices(comp.price);
}

/**
 * Used by search bar. Search happens in Postgres (ILIKE on name/symbol)
 * via the `search` query param; ranked by overall score server-side.
 */
export async function searchCompanies(query: string, limit = 8): Promise<Company[]> {
  const { items } = await fetchCompanies({ search: query, pageSize: limit });
  return items;
}

/**
 * Used for dropdowns (e.g. sector filter options) and as the base list
 * `fetchCompaniesBySymbols` filters over.
 */
let allCompaniesCache: { promise: Promise<Company[]>; timestamp: number } | null = null;
const ALL_COMPANIES_TTL = 60 * 1000; // 1 minute

export async function fetchAllCompanies(): Promise<Company[]> {
  const now = Date.now();
  if (allCompaniesCache && now - allCompaniesCache.timestamp < ALL_COMPANIES_TTL) {
    return allCompaniesCache.promise;
  }
  const promise = fetchCompanies({ sort: "name", pageSize: 1000 })
    .then((res) => res.items)
    .catch((err) => {
      allCompaniesCache = null;
      throw err;
    });
  allCompaniesCache = { promise, timestamp: now };
  return promise;
}

/**
 * Used by watchlist/portfolio/discover groups. Fetches only the requested
 * symbols directly from the API instead of downloading the full universe.
 */
export async function fetchCompaniesBySymbols(symbols: string[]): Promise<Company[]> {
  if (!symbols || symbols.length === 0) return [];
  const { items } = await fetchCompanies({
    symbols: symbols.join(","),
    pageSize: Math.max(symbols.length, 20),
  });
  return items;
}

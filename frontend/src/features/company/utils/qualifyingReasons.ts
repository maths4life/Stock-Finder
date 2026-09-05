import type { Company } from "@/shared/api/types";

/**
 * Compact "✓ reason" bullets for the Discover "Why these stocks?" strip.
 * This is formatting only — every check reads a field the backend already
 * computed (scores.py / analysis/scoring_engine.py), nothing here
 * recalculates a score or invents a threshold that isn't already implied
 * by the underlying boolean/verdict fields themselves.
 */
export function qualifyingReasons(c: Company): string[] {
  const reasons: string[] = [];

  if (c.roe >= 15) reasons.push(`ROE ${c.roe.toFixed(1)}% — above a healthy 15% bar`);
  if (c.profitGrowthPct > 0) reasons.push(`Profit growth +${c.profitGrowthPct.toFixed(1)}% YoY`);
  if (c.salesGrowthPct > 0) reasons.push(`Revenue growth +${c.salesGrowthPct.toFixed(1)}% YoY`);
  if (c.aboveEma200) reasons.push("Price above the 200-day moving average");
  if (c.goldenCross) reasons.push("Golden cross — 50-DMA above 200-DMA");
  if (c.trend === "Uptrend") reasons.push("Confirmed technical uptrend");
  if (c.debtToEquity < 0.5) reasons.push(`Low leverage — D/E ${c.debtToEquity.toFixed(2)}`);

  return reasons.slice(0, 4);
}

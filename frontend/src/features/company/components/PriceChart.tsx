import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Expand, RotateCcw, Camera, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import type { PriceBar, PriceRange } from "@/shared/api/types";

const RANGES: { value: PriceRange; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
  { value: "ALL", label: "MAX" },
];

type Props = {
  data: PriceBar[];
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  isLoading?: boolean;
  symbol?: string;
};

/** Research page's Price Chart section (Module 3). Renders only fields the
 * backend actually returns from `prices_daily` — no derived or invented
 * values. Candlestick + volume rendered via lightweight-charts (TradingView's
 * own open-source charting library) so the look/feel matches institutional
 * research tools while the data still comes from the app's own API. */
export function PriceChart({ data, range, onRangeChange, isLoading, symbol }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl ring-1 ring-hairline bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 hairline-b">
        <span className="text-[11px] font-mono uppercase tracking-widest text-ink-subtle">
          Price Chart
        </span>
        <button
          onClick={() => setExpanded(true)}
          disabled={isLoading || data.length < 2}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 ring-hairline text-[11px] text-ink-subtle hover:text-ink hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Expand className="size-3" />
          Expand
        </button>
      </div>

      <div className="px-2 pt-3 sm:px-4">
        {isLoading && (
          <div className="h-[320px] sm:h-[480px] lg:h-[580px] rounded-xl bg-secondary/40 animate-pulse" />
        )}

        {!isLoading && data.length < 2 && (
          <div className="h-[320px] sm:h-[480px] lg:h-[580px] rounded-xl ring-1 ring-hairline grid place-items-center text-sm text-ink-muted">
            No price history available for this range.
          </div>
        )}

        {!isLoading && data.length >= 2 && (
          <PriceChartPanel data={data} heightClassName="h-[320px] sm:h-[480px] lg:h-[580px]" />
        )}
      </div>

      <div className="flex items-center justify-center gap-1 px-5 py-3.5 hairline-t">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => onRangeChange(r.value)}
            className={
              "px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors " +
              (r.value === range
                ? "bg-accent text-accent-foreground"
                : "text-ink-subtle hover:text-ink hover:bg-secondary")
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 flex flex-col sm:rounded-2xl overflow-hidden">
          <DialogHeader className="px-5 py-3.5 hairline-b flex-row items-center justify-between space-y-0 text-left">
            <DialogTitle className="text-[11px] font-mono uppercase tracking-widest text-ink-subtle font-normal">
              {symbol ? `${symbol} — Price Chart` : "Price Chart"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-2 pt-3 sm:px-4">
            {data.length >= 2 && <PriceChartPanel data={data} heightClassName="h-full" />}
          </div>
          <div className="flex items-center justify-center gap-1 px-5 py-3.5 hairline-t">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => onRangeChange(r.value)}
                className={
                  "px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors " +
                  (r.value === range
                    ? "bg-accent text-accent-foreground"
                    : "text-ink-subtle hover:text-ink hover:bg-secondary")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PanelHandle = {
  fitContent: () => void;
  takeScreenshot: () => void;
};

/** Legend + toolbar + the actual chart canvas. Used both inline on the
 * research page and inside the fullscreen dialog — each mounts its own
 * lightweight-charts instance since Radix only mounts DialogContent while open. */
function PriceChartPanel({ data, heightClassName }: { data: PriceBar[]; heightClassName: string }) {
  const [showVolume, setShowVolume] = useState(true);
  const chartRef = useRef<PanelHandle>(null);
  const latest = data[data.length - 1];
  const first = data[0];
  const [hovered, setHovered] = useState<PriceBar | null>(null);
  const shown = hovered ?? latest;
  const changePct = first && shown ? ((shown.close - first.close) / first.close) * 100 : 0;
  const isUp = changePct >= 0;

  return (
    <div className={"relative flex flex-col " + heightClassName}>
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums text-ink-subtle">
          {shown && (
            <>
              <span>
                O <span className="text-ink">{fmt(shown.open)}</span>
              </span>
              <span>
                H <span className="text-ink">{fmt(shown.high)}</span>
              </span>
              <span>
                L <span className="text-ink">{fmt(shown.low)}</span>
              </span>
              <span>
                C <span className="text-ink">{fmt(shown.close)}</span>
              </span>
              <span className={isUp ? "text-positive" : "text-negative"}>
                {isUp ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowVolume((v) => !v)}
            title="Toggle volume"
            className={
              "p-1.5 rounded-md ring-1 ring-hairline transition-colors " +
              (showVolume
                ? "bg-secondary text-ink"
                : "text-ink-subtle hover:text-ink hover:bg-secondary")
            }
          >
            <BarChart3 className="size-3.5" />
          </button>
          <button
            onClick={() => chartRef.current?.fitContent()}
            title="Reset view"
            className="p-1.5 rounded-md ring-1 ring-hairline text-ink-subtle hover:text-ink hover:bg-secondary transition-colors"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            onClick={() => chartRef.current?.takeScreenshot()}
            title="Save as image"
            className="p-1.5 rounded-md ring-1 ring-hairline text-ink-subtle hover:text-ink hover:bg-secondary transition-colors"
          >
            <Camera className="size-3.5" />
          </button>
        </div>
      </div>
      <CandlestickChart
        ref={chartRef}
        data={data}
        showVolume={showVolume}
        className="w-full flex-1 min-h-0"
        onCrosshairMove={setHovered}
      />
    </div>
  );
}

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Resolves any CSS color (including this app's oklch() custom properties)
 * to the `rgb()`/`rgba()` form the canvas-based lightweight-charts library
 * can parse — its color parser predates CSS Color 4 and throws on oklch().
 *
 * Note: `getComputedStyle(el).color` is NOT sufficient here. Modern Chromium
 * preserves the original CSS Color 4 function (oklch, etc.) when serializing
 * computed style instead of downgrading it to rgb() the way it used to for
 * legacy color syntax, so that string would still be unparseable by the
 * chart library. Painting to a 1x1 canvas and reading the pixel back forces
 * genuine resolution to concrete sRGB bytes, since canvas 2D always rasterizes
 * to raw pixels regardless of what color space the input was expressed in.
 * Never called during render; only from effects, after mount. */
let colorProbeCtx: CanvasRenderingContext2D | null = null;
function resolveCssColor(value: string): string {
  if (!colorProbeCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorProbeCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorProbeCtx;
  if (!ctx) return value;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/** Applies alpha to an already-resolved rgb()/rgba() string. Avoids
 * color-mix(), which the same canvas color parser also doesn't support. */
function withAlpha(rgbColor: string, alpha: number): string {
  const nums = rgbColor.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return rgbColor;
  const [r, g, b] = nums;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolvedThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: resolveCssColor(cssVar("--ink")),
    inkMuted: resolveCssColor(cssVar("--ink-muted")),
    hairline: resolveCssColor(cssVar("--hairline")),
    positive: resolveCssColor(cssVar("--positive")),
    negative: resolveCssColor(cssVar("--negative")),
  };
}

/** Thin, imperative wrapper around a lightweight-charts instance.
 *
 * SSR-safe by construction, not by checking `typeof window`: lightweight-charts
 * is never statically imported (only its types are, and those are erased at
 * compile time), so the library's code never ships in the server bundle. The
 * `mounted` gate below additionally defers the dynamic `import()` — and thus
 * any chart creation — until after this component has mounted on the client,
 * so the DOM React hydrates against is just this empty, mount-independent
 * container div on both server and client. */
const CandlestickChart = forwardRef<
  PanelHandle,
  {
    data: PriceBar[];
    showVolume: boolean;
    className: string;
    onCrosshairMove: (bar: PriceBar | null) => void;
  }
>(function CandlestickChart({ data, showVolume, className, onCrosshairMove }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useImperativeHandle(ref, () => ({
    fitContent: () => chartApiRef.current?.timeScale().fitContent(),
    takeScreenshot: () => {
      const canvas = chartApiRef.current?.takeScreenshot();
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "price-chart.png";
        a.click();
        URL.revokeObjectURL(url);
      });
    },
  }));

  // Create the chart once, only after mount, only on the client.
  useEffect(() => {
    if (!mounted) return;
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    import("lightweight-charts").then(
      ({ createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode }) => {
        if (cancelled || !el) return;
        const { ink, inkMuted, hairline, positive, negative } = resolvedThemeColors();

        const chart = createChart(el, {
          autoSize: true,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: inkMuted,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 11,
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: hairline },
            horzLines: { color: hairline },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: inkMuted, width: 1, style: 3, labelBackgroundColor: ink },
            horzLine: { color: inkMuted, width: 1, style: 3, labelBackgroundColor: ink },
          },
          rightPriceScale: {
            borderColor: hairline,
            scaleMargins: { top: 0.08, bottom: showVolume ? 0.28 : 0.08 },
          },
          timeScale: {
            borderColor: hairline,
            timeVisible: false,
            rightOffset: 4,
            fixLeftEdge: true,
          },
          handleScroll: true,
          handleScale: true,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: positive,
          downColor: negative,
          borderUpColor: positive,
          borderDownColor: negative,
          wickUpColor: positive,
          wickDownColor: negative,
          borderVisible: true,
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        chart.priceScale("volume").applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
          visible: false,
        });

        chart.subscribeCrosshairMove((param) => {
          const bar = param.time
            ? (dataRef.current.find((d) => d.date === param.time) ?? null)
            : null;
          onCrosshairMove(bar);
        });

        chartApiRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        // Data may have been set (or changed) while the module was loading.
        pushChartData(candleSeries, volumeSeries, dataRef.current, positive, negative);
        chart.timeScale().fitContent();
      },
    );

    return () => {
      cancelled = true;
      chartApiRef.current?.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chart is created once after mount; data/theme are pushed via the effects below
  }, [mounted]);

  // Push data whenever it changes (range switch, refetch).
  useEffect(() => {
    if (!mounted) return;
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const { positive, negative } = resolvedThemeColors();
    pushChartData(candleSeriesRef.current, volumeSeriesRef.current, data, positive, negative);
    chartApiRef.current?.timeScale().fitContent();
  }, [data, mounted]);

  // Toggle the volume pane's visibility without recreating the chart.
  useEffect(() => {
    if (!mounted) return;
    chartApiRef.current?.priceScale("right").applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolume ? 0.28 : 0.08 },
    });
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume, mounted]);

  return <div ref={containerRef} className={className} />;
});

function pushChartData(
  candleSeries: ISeriesApi<"Candlestick">,
  volumeSeries: ISeriesApi<"Histogram">,
  data: PriceBar[],
  resolvedPositive: string,
  resolvedNegative: string,
) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

  candleSeries.setData(
    sorted.map((d) => ({
      time: d.date as UTCTimestamp | string,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })),
  );

  const upFill = withAlpha(resolvedPositive, 0.55);
  const downFill = withAlpha(resolvedNegative, 0.55);
  volumeSeries.setData(
    sorted.map((d, i) => ({
      time: d.date as UTCTimestamp | string,
      value: d.volume,
      color: i === 0 || d.close >= sorted[i - 1].close ? upFill : downFill,
    })),
  );
}

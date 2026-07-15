type Props = {
  data: number[];
  width?: number;
  height?: number;
  tone?: "positive" | "negative" | "neutral" | "accent";
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
};

const toneToVar: Record<NonNullable<Props["tone"]>, string> = {
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  neutral: "var(--color-ink-muted)",
  accent: "var(--color-accent)",
};

export function Sparkline({
  data,
  width = 120,
  height = 32,
  tone = "accent",
  strokeWidth = 1.25,
  fill = false,
  className,
}: Props) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  const color = toneToVar[tone];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
    >
      {fill && <path d={areaPath} fill={color} opacity={0.08} />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

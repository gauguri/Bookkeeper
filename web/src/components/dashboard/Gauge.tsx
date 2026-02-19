import { useMemo } from "react";

type GaugeSegment = {
  min: number;
  max: number;
  color: string;
};

type GaugeProps = {
  valuePercent: number;
  min?: number;
  max?: number;
  thresholds?: GaugeSegment[];
  label?: string;
  size?: "sm" | "md";
};

const DEFAULT_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 30, color: "#EF4444" },
  { min: 30, max: 40, color: "#F97316" },
  { min: 40, max: 50, color: "#EAB308" },
  { min: 50, max: 60, color: "#84CC16" },
  { min: 60, max: 100, color: "#22C55E" }
];

const TRACK_COLOR = "#E2E8F0";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const polarToCartesian = (cx: number, cy: number, radius: number, angleDegrees: number) => ({
  x: cx + radius * Math.cos(toRadians(angleDegrees)),
  y: cy - radius * Math.sin(toRadians(angleDegrees))
});

const describeArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const delta = Math.abs(endAngle - startAngle);
  const largeArcFlag = delta > 180 ? 1 : 0;
  const sweepFlag = startAngle > endAngle ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

const normalizeInput = (valuePercent: number, min: number, max: number): number => {
  if (!Number.isFinite(valuePercent)) {
    return min;
  }
  return clamp(valuePercent, min, max);
};

export default function Gauge({ valuePercent, min = 0, max = 100, thresholds = DEFAULT_SEGMENTS, label = "Gauge", size = "md" }: GaugeProps) {
  const cx = 120;
  const cy = 120;
  const radius = 90;
  const strokeWidth = size === "sm" ? 18 : 22;

  const safeValue = normalizeInput(valuePercent, min, max);
  const span = max - min || 1;
  const valueRatio = clamp((safeValue - min) / span, 0, 1);
  const needleAngle = 180 - valueRatio * 180; // 180 = leftmost, 0 = rightmost

  const needleLength = 72;
  const needleTip = polarToCartesian(cx, cy, needleLength, needleAngle);

  const normalizedSegments = useMemo(
    () =>
      thresholds
        .map((segment) => ({
          ...segment,
          min: clamp(segment.min, min, max),
          max: clamp(segment.max, min, max)
        }))
        .filter((segment) => segment.max > segment.min),
    [max, min, thresholds]
  );

  // Find the color at the current value
  const activeColor = useMemo(() => {
    for (const seg of normalizedSegments) {
      if (safeValue >= seg.min && safeValue <= seg.max) {
        return seg.color;
      }
    }
    return normalizedSegments[normalizedSegments.length - 1]?.color ?? "#22C55E";
  }, [normalizedSegments, safeValue]);

  return (
    <svg viewBox="0 0 240 140" className="w-full" role="img" aria-label={label}>
      {/* Background track */}
      <path
        d={describeArc(cx, cy, radius, 180, 0)}
        fill="none"
        stroke={TRACK_COLOR}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* Colored segments */}
      {normalizedSegments.map((segment, index) => {
        const startRatio = (segment.min - min) / span;
        const endRatio = (segment.max - min) / span;
        const segmentStart = 180 - startRatio * 180;
        const segmentEnd = 180 - endRatio * 180;

        return (
          <path
            key={`gauge-segment-${index}`}
            d={describeArc(cx, cy, radius, segmentStart, segmentEnd)}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            opacity={0.85}
          />
        );
      })}

      {/* Rounded end caps */}
      {normalizedSegments.length > 0 && (
        <>
          {/* Left cap */}
          <circle
            cx={polarToCartesian(cx, cy, radius, 180).x}
            cy={polarToCartesian(cx, cy, radius, 180).y}
            r={strokeWidth / 2}
            fill={normalizedSegments[0].color}
            opacity={0.85}
          />
          {/* Right cap */}
          <circle
            cx={polarToCartesian(cx, cy, radius, 0).x}
            cy={polarToCartesian(cx, cy, radius, 0).y}
            r={strokeWidth / 2}
            fill={normalizedSegments[normalizedSegments.length - 1].color}
            opacity={0.85}
          />
        </>
      )}

      {/* Needle line */}
      <line
        x1={cx}
        y1={cy}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke="#1E293B"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transition: "all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      />

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="6" fill="#1E293B" />
      <circle cx={cx} cy={cy} r="3" fill={activeColor} />
    </svg>
  );
}

export type { GaugeSegment, GaugeProps };

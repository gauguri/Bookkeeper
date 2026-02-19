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
};

const DEFAULT_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 30, color: "#EF4444" },
  { min: 30, max: 40, color: "#F97316" },
  { min: 40, max: 50, color: "#FACC15" },
  { min: 50, max: 60, color: "#A3E635" },
  { min: 60, max: 100, color: "#22C55E" }
];

const TRACK_COLOR = "#E2E8F0";
const NEEDLE_COLOR = "#0F172A";
const SEGMENT_GAP_DEGREES = 2.4;

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

const pointToString = ({ x, y }: { x: number; y: number }) => `${x},${y}`;

const normalizeInput = (valuePercent: number, min: number, max: number): number => {
  if (!Number.isFinite(valuePercent)) {
    return min;
  }

  const normalized = valuePercent <= 1 ? valuePercent * 100 : valuePercent;
  return clamp(normalized, min, max);
};

export default function Gauge({ valuePercent, min = 0, max = 100, thresholds = DEFAULT_SEGMENTS, label = "Gauge" }: GaugeProps) {
  const cx = 120;
  const cy = 120;
  const radius = 90;
  const strokeWidth = 24;

  const safeValue = normalizeInput(valuePercent, min, max);
  const span = max - min || 1;
  const valueRatio = clamp((safeValue - min) / span, 0, 1);
  const needleAngle = -90 + valueRatio * 180;

  const needleTip = polarToCartesian(cx, cy, 76, 90 - needleAngle);
  const needleLeft = polarToCartesian(cx, cy, 11, 175 - needleAngle);
  const needleRight = polarToCartesian(cx, cy, 11, 5 - needleAngle);

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

  return (
    <svg viewBox="0 0 240 160" className="w-full max-w-[320px]" role="img" aria-label={label}>
      <path d={describeArc(cx, cy, radius, 180, 0)} fill="none" stroke={TRACK_COLOR} strokeWidth={strokeWidth} strokeLinecap="round" />

      {normalizedSegments.map((segment, index) => {
        const startRatio = (segment.min - min) / span;
        const endRatio = (segment.max - min) / span;
        const segmentStart = 180 - startRatio * 180;
        const segmentEnd = 180 - endRatio * 180;
        const adjustedStart = segmentStart - SEGMENT_GAP_DEGREES / 2;
        const adjustedEnd = segmentEnd + SEGMENT_GAP_DEGREES / 2;

        return (
          <path
            key={`gauge-segment-${index}`}
            d={describeArc(cx, cy, radius, adjustedStart, adjustedEnd)}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}

      <g style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "fill-box", transition: "transform 300ms ease-out", transform: `rotate(${needleAngle}deg)` }}>
        <polygon points={[pointToString(needleTip), pointToString(needleLeft), pointToString(needleRight)].join(" ")} fill={NEEDLE_COLOR} />
      </g>
      <circle cx={cx} cy={cy} r="11" fill={NEEDLE_COLOR} />
      <circle cx={cx} cy={cy} r="4.5" fill="#E2E8F0" />
    </svg>
  );
}

export type { GaugeSegment, GaugeProps };

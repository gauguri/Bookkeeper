import { formatPercent, getGmZoneColor, getGmZoneLabel, normalizeGrossMargin } from "../../utils/metrics";

type GrossMarginGaugeProps = {
  value?: unknown;
  valuePercent?: unknown;
  title?: string;
  subtitle?: string;
};

type Point = { x: number; y: number };

const ZONE_COLORS = {
  red: "#EF4444",
  amber: "#F59E0B",
  green: "#10B981"
} as const;

const ZONE_LABEL_COLORS = {
  red: "#DC2626",
  amber: "#D97706",
  green: "#059669"
} as const;

const TRACK_COLOR = "#E5E7EB";
const NEEDLE_COLOR = "#1F2937";
const VALUE_COLOR = "#111827";
const SEGMENT_GAP_DEGREES = 3;
const SEGMENT_COUNT = 10;

const toRadians = (angleDeg: number) => (angleDeg * Math.PI) / 180;

const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number): Point => {
  const rad = toRadians(angleDeg);
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad)
  };
};

const describeArc = (cx: number, cy: number, radius: number, startAngleDeg: number, endAngleDeg: number): string => {
  const start = polarToCartesian(cx, cy, radius, startAngleDeg);
  const end = polarToCartesian(cx, cy, radius, endAngleDeg);
  const delta = Math.abs(endAngleDeg - startAngleDeg);
  const largeArcFlag = delta > 180 ? 1 : 0;
  const sweepFlag = startAngleDeg > endAngleDeg ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

const percentToAngle = (percent: number): number => 180 - (percent / 100) * 180;

const getSegmentColor = (index: number): string => {
  const rangeStart = index * 10;
  const rangeEnd = rangeStart + 10;

  if (rangeEnd <= 40) {
    return ZONE_COLORS.red;
  }

  if (rangeStart >= 50) {
    return ZONE_COLORS.green;
  }

  if (rangeStart >= 40 && rangeEnd <= 50) {
    return ZONE_COLORS.amber;
  }

  const midpoint = (rangeStart + rangeEnd) / 2;
  if (midpoint < 40) {
    return ZONE_COLORS.red;
  }
  if (midpoint < 50) {
    return ZONE_COLORS.amber;
  }
  return ZONE_COLORS.green;
};

export default function GrossMarginGauge({
  value,
  valuePercent,
  title = "GROSS MARGIN",
  subtitle = "From invoice snapshots"
}: GrossMarginGaugeProps) {
  const rawValue = value ?? valuePercent;
  const coercedValue = Number(rawValue);
  const normalizedPercent = Number.isNaN(coercedValue) ? 0 : normalizeGrossMargin(coercedValue);
  const zone = getGmZoneColor(normalizedPercent);
  const zoneLabel = getGmZoneLabel(normalizedPercent).toUpperCase();

  const cx = 120;
  const cy = 120;
  const radius = 90;
  const strokeWidth = 24;
  const needleLength = 76;

  const needleAngle = percentToAngle(normalizedPercent);
  const needleTip = polarToCartesian(cx, cy, needleLength, needleAngle);

  const segmentSweep = 180 / SEGMENT_COUNT;

  return (
    <div className="app-card p-5" aria-label={`${title} ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-3 flex items-center justify-center">
        <svg viewBox="0 0 240 160" className="w-full max-w-[320px]" role="img" aria-hidden="true">
          <path d={describeArc(cx, cy, radius, 180, 0)} fill="none" stroke={TRACK_COLOR} strokeWidth={strokeWidth} strokeLinecap="round" />

          {Array.from({ length: SEGMENT_COUNT }).map((_, index) => {
            const segmentStart = 180 - index * segmentSweep;
            const segmentEnd = segmentStart - segmentSweep;
            const arcStart = segmentStart - SEGMENT_GAP_DEGREES / 2;
            const arcEnd = segmentEnd + SEGMENT_GAP_DEGREES / 2;

            return (
              <path
                key={`segment-${index}`}
                d={describeArc(cx, cy, radius, arcStart, arcEnd)}
                fill="none"
                stroke={getSegmentColor(index)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}

          <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke={NEEDLE_COLOR} strokeWidth="4" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="10" fill={NEEDLE_COLOR} />
          <circle cx={cx} cy={cy} r="4" fill="#F9FAFB" />
        </svg>
      </div>

      <div className="-mt-1 flex flex-col items-center">
        <p className="text-3xl font-bold tabular-nums" style={{ color: VALUE_COLOR }}>
          {formatPercent(normalizedPercent, 1)}
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ZONE_LABEL_COLORS[zone] }}>
          {zoneLabel}
        </p>
      </div>
      <p className="mt-1 text-center text-xs text-muted">{subtitle}</p>
    </div>
  );
}

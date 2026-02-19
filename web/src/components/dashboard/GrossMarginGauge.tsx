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

export default function GrossMarginGauge({
  value,
  valuePercent,
  title = "GROSS MARGIN",
  subtitle = "From invoice snapshots"
}: GrossMarginGaugeProps) {
  const rawValue = value ?? valuePercent;
  const normalizedPercent = normalizeGrossMargin(rawValue);
  const zone = getGmZoneColor(normalizedPercent);
  const zoneLabel = getGmZoneLabel(normalizedPercent).toUpperCase();

  const cx = 120;
  const cy = 120;
  const radius = 80;
  const strokeWidth = 16;
  const needleLength = 66;

  const angleAt40 = percentToAngle(40);
  const angleAt50 = percentToAngle(50);

  const needleAngle = percentToAngle(normalizedPercent);
  const needleTip = polarToCartesian(cx, cy, needleLength, needleAngle);

  const ticks = [0, 40, 50, 100];

  return (
    <div className="app-card p-5" aria-label={`${title} ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-3 flex items-center justify-center">
        <svg viewBox="0 0 240 160" className="w-full max-w-[320px]" role="img" aria-hidden="true">
          <path d={describeArc(cx, cy, radius, 180, 0)} fill="none" stroke={TRACK_COLOR} strokeWidth={strokeWidth} strokeLinecap="round" />

          <path d={describeArc(cx, cy, radius, 180, angleAt40)} fill="none" stroke={ZONE_COLORS.red} strokeWidth={strokeWidth} strokeLinecap="round" />
          <path d={describeArc(cx, cy, radius, angleAt40, angleAt50)} fill="none" stroke={ZONE_COLORS.amber} strokeWidth={strokeWidth} strokeLinecap="round" />
          <path d={describeArc(cx, cy, radius, angleAt50, 0)} fill="none" stroke={ZONE_COLORS.green} strokeWidth={strokeWidth} strokeLinecap="round" />

          {ticks.map((tick) => {
            const angle = percentToAngle(tick);
            const inner = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 3, angle);
            const outer = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 3, angle);
            const labelBase = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 16, angle);

            const xAdjust = tick === 40 ? -6 : tick === 50 ? 6 : 0;
            const yAdjust = tick === 0 || tick === 100 ? 5 : 1;

            return (
              <g key={tick}>
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
                <text
                  x={labelBase.x + xAdjust}
                  y={labelBase.y + yAdjust}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#6B7280"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke={NEEDLE_COLOR} strokeWidth="4" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="9" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="5" fill={NEEDLE_COLOR} />
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

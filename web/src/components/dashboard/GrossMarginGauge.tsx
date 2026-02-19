import { formatPercent, getGmZoneColor, getGmZoneLabel, normalizeGrossMargin } from "../../utils/metrics";

type GrossMarginGaugeProps = {
  valuePercent: unknown;
  title?: string;
  subtitle?: string;
};

const zoneStyles = {
  red: "stroke-rose-500",
  amber: "stroke-amber-500",
  green: "stroke-emerald-500"
};

const labelStyles = {
  red: "text-rose-600",
  amber: "text-amber-600",
  green: "text-emerald-600"
};

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

const pctToAngle = (percent: number) => -90 + (percent / 100) * 180;

export default function GrossMarginGauge({
  valuePercent,
  title = "Gross Margin",
  subtitle = "From invoice snapshots"
}: GrossMarginGaugeProps) {
  const normalizedPercent = normalizeGrossMargin(valuePercent);
  const zone = getGmZoneColor(normalizedPercent);
  const zoneLabel = getGmZoneLabel(normalizedPercent);

  const centerX = 100;
  const centerY = 100;
  const radius = 74;
  const needleAngle = pctToAngle(normalizedPercent);
  const needleTip = polarToCartesian(centerX, centerY, radius - 10, needleAngle);

  const zones = [
    { start: 0, end: 40, color: zoneStyles.red },
    { start: 40, end: 50, color: zoneStyles.amber },
    { start: 50, end: 100, color: zoneStyles.green }
  ];

  const tickValues = [0, 40, 50, 100];

  return (
    <div className="app-card p-5" aria-label={`${title} ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-2 flex items-center justify-center">
        <svg viewBox="0 0 200 130" className="w-full max-w-[260px]" role="img" aria-hidden="true">
          {zones.map((segment) => (
            <path
              key={`${segment.start}-${segment.end}`}
              d={describeArc(centerX, centerY, radius, pctToAngle(segment.start), pctToAngle(segment.end))}
              fill="none"
              strokeWidth="14"
              strokeLinecap="round"
              className={segment.color}
            />
          ))}

          {tickValues.map((tick) => {
            const tickAngle = pctToAngle(tick);
            const outer = polarToCartesian(centerX, centerY, radius + 8, tickAngle);
            const inner = polarToCartesian(centerX, centerY, radius - 8, tickAngle);
            const labelPos = polarToCartesian(centerX, centerY, radius + 22, tickAngle);
            return (
              <g key={tick}>
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" className="text-slate-400" strokeWidth="2" />
                <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[9px]">
                  {tick}
                </text>
              </g>
            );
          })}

          <line x1={centerX} y1={centerY} x2={needleTip.x} y2={needleTip.y} stroke="currentColor" className="text-slate-700" strokeWidth="3" strokeLinecap="round" />
          <circle cx={centerX} cy={centerY} r="5" className="fill-slate-700" />
        </svg>
      </div>

      <div className="-mt-2 flex flex-col items-center">
        <p className="text-2xl font-semibold tabular-nums">{formatPercent(normalizedPercent, 1)}</p>
        <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${labelStyles[zone]}`}>{zoneLabel}</p>
      </div>
      <p className="mt-1 text-xs text-muted text-center">{subtitle}</p>
    </div>
  );
}

import { COLOR } from "../../utils/colorScales";
import { formatKpiValue } from "../../utils/formatters";
import { calculateNeedleAngle } from "./gaugeMath";

type Props = {
  value: number;
  min?: number;
  max?: number;
  target?: number | null;
  label: string;
  unit?: string;
  zones?: { min: number; max: number; color: string }[];
};

const DEFAULT_ZONES = [
  { min: 0, max: 33, color: COLOR.negative },
  { min: 33, max: 66, color: COLOR.warning },
  { min: 66, max: 100, color: COLOR.positive },
];

export default function GaugeChart({
  value,
  min = 0,
  max = 100,
  target,
  label,
  unit = "",
  zones = DEFAULT_ZONES,
}: Props) {
  const gaugeStartAngle = -90;
  const gaugeEndAngle = 90;
  const angle = calculateNeedleAngle(value, min, max, gaugeStartAngle, gaugeEndAngle);

  const cx = 100;
  const cy = 90;
  const outerR = 75;
  const innerR = 55;
  const needleTip = polarToCartesian(cx, cy, innerR - 5, angle);

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path
          d={describeArc(cx, cy, outerR, gaugeStartAngle, gaugeEndAngle)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={outerR - innerR}
          strokeLinecap="round"
        />

        {/* Colored zone arcs */}
        {zones.map((zone, i) => {
          const zStart = calculateNeedleAngle(zone.min, min, max, gaugeStartAngle, gaugeEndAngle);
          const zEnd = calculateNeedleAngle(zone.max, min, max, gaugeStartAngle, gaugeEndAngle);
          return (
            <path
              key={i}
              d={describeArc(cx, cy, (outerR + innerR) / 2, zStart, zEnd)}
              fill="none"
              stroke={zone.color}
              strokeWidth={(outerR - innerR) * 0.7}
              strokeLinecap="butt"
              opacity={0.3}
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#1e3a5f"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={5} fill="#1e3a5f" />

        {/* Target line */}
        {target != null && (() => {
          const tAngle = calculateNeedleAngle(target, min, max, gaugeStartAngle, gaugeEndAngle);
          const inner = polarToCartesian(cx, cy, innerR - 2, tAngle);
          const outer = polarToCartesian(cx, cy, outerR + 2, tAngle);
          return (
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#1e3a5f"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
          );
        })()}

        {/* Min / Max labels */}
        <text x={cx - outerR - 5} y={cy + 14} textAnchor="end" className="fill-muted text-[10px]">
          {min}
        </text>
        <text x={cx + outerR + 5} y={cy + 14} textAnchor="start" className="fill-muted text-[10px]">
          {max}
        </text>
      </svg>
      <p className="mt-1 text-xl font-bold">{formatKpiValue(value, unit)}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

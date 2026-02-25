import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";
import { CHART_MARGIN, AXIS_STYLE } from "../../utils/chartHelpers";
import { PL_PALETTE } from "../../utils/colorScales";
import { formatCompact, formatCurrency } from "../../utils/formatters";
import { NEUTRALS } from "../../theme/chartPalette";

type WaterfallItem = {
  label: string;
  value: number;
  type: string; // total | increase | decrease | subtotal
};

type Props = {
  data: WaterfallItem[];
  title?: string;
  height?: number;
};

type NormalizedType = "total" | "increase" | "decrease" | "neutral";

type WaterfallDatum = {
  name: string;
  hidden: number;
  value: number;
  rawValue: number;
  delta: number;
  runningTotal: number;
  semanticType: NormalizedType;
};

function normalizeType(type: string): NormalizedType {
  if (type === "total" || type === "subtotal") return "total";
  if (type === "increase") return "increase";
  if (type === "decrease") return "decrease";
  return "neutral";
}

function getSemanticColor(type: NormalizedType, delta: number): string {
  if (type === "total") return PL_PALETTE.positive;
  if (delta === 0) return NEUTRALS.muted;
  return delta > 0 ? PL_PALETTE.positive : PL_PALETTE.negative;
}

const LEGEND_ITEMS = [
  { value: "Total", type: "circle", color: PL_PALETTE.positive },
  { value: "Increase", type: "circle", color: PL_PALETTE.positive },
  { value: "Decrease", type: "circle", color: PL_PALETTE.negative },
] as const;

export default function WaterfallChart({ data, title, height = 300 }: Props) {
  // Build a true waterfall with offset + visible delta segment.
  let running = 0;
  const chartData: WaterfallDatum[] = data.map((item) => {
    const semanticType = normalizeType(item.type);
    const numeric = Number(item.value) || 0;

    if (semanticType === "total") {
      const totalValue = Math.abs(numeric);
      const result: WaterfallDatum = {
        name: item.label,
        value: totalValue,
        hidden: 0,
        rawValue: totalValue,
        delta: totalValue - running,
        runningTotal: totalValue,
        semanticType,
      };
      running = totalValue;
      return result;
    }

    const delta = semanticType === "decrease" ? -Math.abs(numeric) : semanticType === "increase" ? Math.abs(numeric) : numeric;
    const start = running;
    running += delta;
    const result: WaterfallDatum = {
      name: item.label,
      value: Math.abs(delta),
      hidden: delta >= 0 ? start : start + delta,
      rawValue: numeric,
      delta,
      runningTotal: running,
      semanticType,
    };
    return result;
  });

  return (
    <div className="app-card p-4">
      {title && <h3 className="mb-4 text-sm font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={PL_PALETTE.neutralGrid} opacity={0.3} />
          <XAxis dataKey="name" {...AXIS_STYLE} angle={-20} textAnchor="end" height={50} />
          <YAxis tickFormatter={formatCompact} {...AXIS_STYLE} />
          <Tooltip
            formatter={(value: number, _name: string, props: { payload?: WaterfallDatum }) => {
              const payload = props?.payload;
              if (!payload) return value;
              return [formatCurrency(payload.delta, true), "Delta vs prior"];
            }}
            labelFormatter={(label) => `Stage: ${label}`}
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const point = payload[0].payload as WaterfallDatum;
              return (
                <div
                  style={{
                    backgroundColor: "var(--color-surface, #fff)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "13px",
                    padding: "10px 12px",
                  }}
                >
                  <p className="font-medium">{point.name}</p>
                  <p>Value: {formatCurrency(point.rawValue, true)}</p>
                  <p>Delta vs prior: {formatCurrency(point.delta, true)}</p>
                  <p>Running total: {formatCurrency(point.runningTotal, true)}</p>
                </div>
              );
            }}
            contentStyle={{
              backgroundColor: "var(--color-surface, #fff)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" payload={[...LEGEND_ITEMS]} />
          <ReferenceLine y={0} stroke={PL_PALETTE.neutralAxis} strokeWidth={1} />
          <Bar dataKey="hidden" stackId="stack" fill="transparent" />
          <Bar dataKey="value" stackId="stack" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getSemanticColor(entry.semanticType, entry.delta)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

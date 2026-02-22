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
} from "recharts";
import { CHART_MARGIN, AXIS_STYLE } from "../../utils/chartHelpers";
import { COLOR } from "../../utils/colorScales";
import { formatCompact, formatCurrency } from "../../utils/formatters";

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

export default function WaterfallChart({ data, title, height = 300 }: Props) {
  // Build waterfall data with cumulative running total
  let running = 0;
  const chartData = data.map((item) => {
    if (item.type === "total" || item.type === "subtotal") {
      const result = {
        name: item.label,
        value: Math.abs(item.value),
        hidden: 0,
        isTotal: true,
        rawValue: item.value,
      };
      running = item.value;
      return result;
    }
    const start = running;
    running += item.value;
    const result = {
      name: item.label,
      value: Math.abs(item.value),
      hidden: item.value >= 0 ? start : start + item.value,
      isTotal: false,
      rawValue: item.value,
    };
    return result;
  });

  return (
    <div className="app-card p-4">
      {title && <h3 className="mb-4 text-sm font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" {...AXIS_STYLE} angle={-20} textAnchor="end" height={50} />
          <YAxis tickFormatter={formatCompact} {...AXIS_STYLE} />
          <Tooltip
            formatter={(value: number, name: string, props: any) =>
              formatCurrency(props.payload.rawValue, true)
            }
            contentStyle={{
              backgroundColor: "var(--color-surface, #fff)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
          <Bar dataKey="hidden" stackId="stack" fill="transparent" />
          <Bar dataKey="value" stackId="stack" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.isTotal
                    ? COLOR.info
                    : entry.rawValue >= 0
                      ? COLOR.positive
                      : COLOR.negative
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

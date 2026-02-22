import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_MARGIN, AXIS_STYLE } from "../../utils/chartHelpers";
import { AGING_COLORS } from "../../utils/colorScales";
import { formatCurrency, formatCompact } from "../../utils/formatters";
import type { AgingData } from "../../hooks/useAnalytics";

type Props = {
  data: AgingData;
  title?: string;
  height?: number;
};

const BUCKET_COLORS = [
  AGING_COLORS.current,
  AGING_COLORS["1_30"],
  AGING_COLORS["31_60"],
  AGING_COLORS["61_90"],
  AGING_COLORS["90_plus"],
];

export default function AgingChart({ data, title, height = 240 }: Props) {
  const chartData = data.bucket_labels.map((label, i) => ({
    name: label,
    value: data.bucket_values[i],
    color: BUCKET_COLORS[i],
  }));

  return (
    <div className="app-card p-4">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title || data.label}</h3>
          <span className="text-sm font-bold">{formatCurrency(data.total)}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} layout="vertical" margin={{ ...CHART_MARGIN, left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
          <XAxis type="number" tickFormatter={formatCompact} {...AXIS_STYLE} />
          <YAxis type="category" dataKey="name" {...AXIS_STYLE} width={50} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value, true)}
            contentStyle={{
              backgroundColor: "var(--color-surface, #fff)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-3">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted">{entry.name}</span>
            <span className="font-medium">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

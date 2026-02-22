import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS } from "../../utils/colorScales";
import { formatCurrency, formatPercent } from "../../utils/formatters";

type DataItem = {
  category: string;
  value: number;
};

type Props = {
  data: DataItem[];
  title?: string;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
};

export default function DistributionChart({
  data,
  title,
  height = 280,
  centerLabel,
  centerValue,
}: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className="app-card p-4">
      {title && <h3 className="mb-4 text-sm font-semibold">{title}</h3>}
      <div className="flex items-center gap-6">
        <div className="relative" style={{ width: height, height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sortedData}
                dataKey="value"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                stroke="none"
              >
                {sortedData.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value, true)}
                contentStyle={{
                  backgroundColor: "var(--color-surface, #fff)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {(centerLabel || centerValue) && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {centerValue && <span className="text-xl font-bold">{centerValue}</span>}
              {centerLabel && <span className="text-xs text-muted">{centerLabel}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {sortedData.slice(0, 8).map((item, i) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.category} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="flex-1 truncate text-muted">{item.category}</span>
                <span className="font-medium">{formatCurrency(item.value)}</span>
                <span className="text-muted">{formatPercent(pct)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

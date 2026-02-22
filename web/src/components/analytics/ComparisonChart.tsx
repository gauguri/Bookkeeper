import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_MARGIN, AXIS_STYLE } from "../../utils/chartHelpers";
import { COLOR, CHART_COLORS } from "../../utils/colorScales";
import { formatCompact, formatCurrency } from "../../utils/formatters";

type DataPoint = {
  label: string;
  actual: number;
  budget?: number;
  prior_year?: number;
};

type Props = {
  data: DataPoint[];
  title?: string;
  height?: number;
};

export default function ComparisonChart({ data, title, height = 280 }: Props) {
  const hasBudget = data.some((d) => d.budget != null);
  const hasPriorYear = data.some((d) => d.prior_year != null);

  return (
    <div className="app-card p-4">
      {title && <h3 className="mb-4 text-sm font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="label" {...AXIS_STYLE} />
          <YAxis tickFormatter={formatCompact} {...AXIS_STYLE} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value, true)}
            contentStyle={{
              backgroundColor: "var(--color-surface, #fff)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Legend iconType="circle" iconSize={8} />
          <Bar
            dataKey="actual"
            fill={CHART_COLORS[0]}
            name="Actual"
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
          {hasBudget && (
            <Bar
              dataKey="budget"
              fill={CHART_COLORS[1]}
              name="Budget"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          )}
          {hasPriorYear && (
            <Bar
              dataKey="prior_year"
              fill={CHART_COLORS[2]}
              name="Prior Year"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { RevenueTrendPoint } from "../../hooks/useCustomers";
import { formatCurrency, formatCompact } from "../../utils/formatters";
import { CHART_MARGIN, AXIS_STYLE } from "../../utils/chartHelpers";

type Props = { data: RevenueTrendPoint[]; title?: string };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="app-card p-3 text-xs shadow-lg">
      <p className="font-medium text-muted">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="mt-1 font-semibold" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value, true)}
        </p>
      ))}
    </div>
  );
}

export default function CustomerRevenueChart({ data, title = "Revenue & Payments (12 Months)" }: Props) {
  return (
    <div className="app-card p-4">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="period" {...AXIS_STYLE} />
          <YAxis tickFormatter={formatCompact} {...AXIS_STYLE} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            formatter={(value: string) => <span className="text-xs text-muted">{value}</span>}
          />
          <Bar dataKey="revenue" name="Invoiced" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
          <Bar dataKey="payments" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { ItemSalesTrendPoint } from "../../hooks/useItems";

type Props = { data: ItemSalesTrendPoint[] };

export default function ItemSalesChart({ data }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    label: d.period.slice(5), // "MM" from "YYYY-MM"
  }));

  return (
    <div className="app-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Sales Trend (12 Months)</h3>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No sales data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={formatted} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value: number, name: string) => {
                const key = String(name || "").toLowerCase();
                const isRevenue = key === "revenue";
                return [isRevenue ? `$${value.toLocaleString()}` : value.toLocaleString(), isRevenue ? "Revenue" : "Units"];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="units" name="Units" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

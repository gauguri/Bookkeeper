import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  trend: { day: string; balance: number }[];
  categories: { category: string; value: number }[];
  progress: { account: string; reconciled: number; unreconciled: number }[];
  loading?: boolean;
  onCategoryClick: (category: string) => void;
};

const colors = ["#2563eb", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e"];

export default function BankingCharts({ trend, categories, progress, loading, onCategoryClick }: Props) {
  if (loading) {
    return <div className="grid gap-3 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="app-card p-4"><div className="app-skeleton h-56" /></div>)}</div>;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <section className="app-card p-4 xl:col-span-2">
        <h3 className="text-sm font-semibold">Cash balance trend</h3>
        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Line type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="app-card p-4">
        <h3 className="text-sm font-semibold">Spend / inflow by category</h3>
        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categories} dataKey="value" nameKey="category" innerRadius={50} outerRadius={78} onClick={(item) => onCategoryClick(item.category)}>
                {categories.map((entry, idx) => <Cell key={entry.category} fill={colors[idx % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="app-card p-4 xl:col-span-3">
        <h3 className="text-sm font-semibold">Reconciliation progress</h3>
        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={progress}>
              <XAxis dataKey="account" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="reconciled" stackId="a" fill="#22c55e" />
              <Bar dataKey="unreconciled" stackId="a" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

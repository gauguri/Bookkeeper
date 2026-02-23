import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Entry } from "./types";

type Props = {
  entries: Entry[];
  loading: boolean;
  onFilter: (type: "source" | "account", value: string) => void;
};

const EXPENSES_CHART_COLORS = [
  "var(--pl-positive)",
  "color-mix(in srgb, var(--pl-positive) 85%, #111827)",
  "color-mix(in srgb, var(--pl-positive) 70%, #0f172a)",
  "color-mix(in srgb, var(--pl-positive) 58%, #1f2937)",
  "color-mix(in srgb, var(--pl-positive) 45%, #334155)",
  "color-mix(in srgb, var(--pl-positive) 32%, #475569)",
];

export default function ExpensesCharts({ entries, loading, onFilter }: Props) {
  if (loading) {
    return <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="app-skeleton h-52 rounded-2xl" />)}</div>;
  }

  const overTime = Object.values(entries.reduce<Record<string, { date: string; amount: number }>>((acc, entry) => {
    const key = entry.date;
    acc[key] = acc[key] ?? { date: key, amount: 0 };
    acc[key].amount += Number(entry.amount);
    return acc;
  }, {})).slice(-12);

  const bySource = Object.entries(entries.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.source_type === "PURCHASE_ORDER" ? "Purchase Orders" : "Manual";
    acc[key] = (acc[key] ?? 0) + Number(entry.amount);
    return acc;
  }, {})).map(([name, value]) => ({
    name,
    value,
    fill: name === "Manual" ? "var(--pl-positive)" : "var(--pl-negative)",
  }));

  const byCategory = Object.entries(entries.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.debit_account_type === "EXPENSE" ? entry.debit_account : entry.credit_account;
    acc[key] = (acc[key] ?? 0) + Number(entry.amount);
    return acc;
  }, {})).map(([name, value]) => ({ name, value })).slice(0, 6);

  const cardClass = "bedrock-surface rounded-2xl p-3";

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <article className={cardClass}>
        <p className="mb-2 text-sm font-medium">Spend over time</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={overTime}><XAxis dataKey="date" hide /><YAxis hide /><Tooltip />
              <Bar dataKey="amount" fill="var(--pl-positive)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className={cardClass}>
        <p className="mb-2 text-sm font-medium">Spend by Category</p>
        <div className="h-44">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={72} onClick={(data) => data?.name && onFilter("account", String(data.name))}>
                {byCategory.map((_, index) => <Cell key={index} fill={EXPENSES_CHART_COLORS[index % EXPENSES_CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className={cardClass}>
        <p className="mb-2 text-sm font-medium">Spend by Source</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={bySource}><XAxis dataKey="name" /><YAxis hide /><Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} onClick={(payload) => payload?.name && onFilter("source", String(payload.name))}>
                {bySource.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}

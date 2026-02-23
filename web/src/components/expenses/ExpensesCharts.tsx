import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Entry } from "./types";

type Props = {
  entries: Entry[];
  loading: boolean;
  onFilter: (type: "source" | "account", value: string) => void;
};

const colors = ["#4A6CF7", "#2F8F9D", "#A0A6AD", "#E25555", "#8B5CF6"];

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
  }, {})).map(([name, value]) => ({ name, value }));

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
              <Bar dataKey="amount" fill="#4A6CF7" radius={[6, 6, 0, 0]} />
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
                {byCategory.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
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
              <Bar dataKey="value" fill="#2F8F9D" onClick={(payload) => payload?.name && onFilter("source", String(payload.name))} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}

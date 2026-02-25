import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type LegendProps } from "recharts";
import { Entry } from "./types";
import { formatCurrency, formatPercent } from "../../utils/formatters";
import { getCategoricalColor, getHoverColor, getSelectedStroke, getSourceColor, NEUTRALS, PL_POSITIVE } from "../../theme/chartPalette";

type Props = {
  entries: Entry[];
  loading: boolean;
  dateRange: "mtd" | "qtd" | "ytd" | "custom";
  onFilter: (type: "source" | "account", value: string) => void;
};

type CategoryDatum = { name: string; value: number; fill: string };

type SourceDatum = { name: string; value: number; fill: string };

const sourceLabelByType: Record<string, string> = {
  MANUAL: "Manual",
  PURCHASE_ORDER: "Purchase Orders",
  PAYROLL: "Payroll",
  BILL: "Bill",
  REIMBURSEMENT: "Reimbursement",
};


const categoryLegendFormatter: LegendProps["formatter"] = (value) => {
  const safeLabel = typeof value === "string" ? value : String(value);
  return <span className="text-xs font-medium text-slate-600">{safeLabel}</span>;
};

const rangeLabel: Record<Props["dateRange"], string> = {
  mtd: "MTD",
  qtd: "QTD",
  ytd: "YTD",
  custom: "Custom",
};

export default function ExpensesCharts({ entries, loading, dateRange, onFilter }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  if (loading) {
    return <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="app-skeleton h-52 rounded-2xl" />)}</div>;
  }

  const overTime = Object.values(entries.reduce<Record<string, { date: string; amount: number }>>((acc, entry) => {
    const key = entry.date;
    acc[key] = acc[key] ?? { date: key, amount: 0 };
    acc[key].amount += Number(entry.amount);
    return acc;
  }, {})).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-12);

  const categoryTotal = entries.reduce((acc, entry) => acc + Number(entry.amount), 0);

  const byCategory: CategoryDatum[] = Object.entries(entries.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.debit_account_type === "EXPENSE" ? entry.debit_account : entry.credit_account;
    acc[key] = (acc[key] ?? 0) + Number(entry.amount);
    return acc;
  }, {}))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value], index) => ({ name, value, fill: getCategoricalColor(index) }));

  const bySourceBase = Object.entries(entries.reduce<Record<string, number>>((acc, entry) => {
    const key = sourceLabelByType[entry.source_type] ?? "Other";
    acc[key] = (acc[key] ?? 0) + Number(entry.amount);
    return acc;
  }, {}))
    .sort(([, a], [, b]) => b - a)
    .map(([name, value], index) => ({ name, value, fill: getSourceColor(name, index) }));

  const bySource: SourceDatum[] = bySourceBase.length <= 1
    ? [{ name: "All sources", value: bySourceBase[0]?.value ?? 0, fill: getSourceColor("All sources") }, ...bySourceBase]
    : bySourceBase;

  const cardClass = "bedrock-surface rounded-2xl p-3";

  const sourceLegend = bySource.filter((item) => item.name !== "All sources");

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <article className={cardClass}>
        <p className="text-sm font-medium">Spend over time</p>
        <p className="mb-2 text-xs text-muted">{rangeLabel[dateRange]} trend</p>
        <div className="h-44">
          <ResponsiveContainer>
            <LineChart data={overTime}>
              <CartesianGrid stroke={NEUTRALS.grid} strokeDasharray="3 3" opacity={0.7} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: NEUTRALS.axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: NEUTRALS.axis }} tickFormatter={(value) => formatCurrency(Number(value))} tickLine={false} axisLine={false} width={52} />
              <Tooltip formatter={(value: number) => formatCurrency(Number(value), true)} contentStyle={{ borderRadius: 10, border: `1px solid ${NEUTRALS.grid}` }} />
              <Line type="monotone" dataKey="amount" stroke={PL_POSITIVE} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5, stroke: getSelectedStroke(PL_POSITIVE), strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className={cardClass}>
        <p className="text-sm font-medium">Spend by Category</p>
        <p className="mb-2 text-xs text-muted">Top categories ({rangeLabel[dateRange]})</p>
        <div className="h-44">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="value"
                nameKey="name"
                outerRadius={70}
                innerRadius={42}
                paddingAngle={2}
                onClick={(data) => {
                  if (!data?.name) return;
                  setActiveCategory(String(data.name));
                  onFilter("account", String(data.name));
                }}
              >
                {byCategory.map((entry) => {
                  const selected = activeCategory === entry.name;
                  return (
                    <Cell
                      key={entry.name}
                      fill={selected ? getHoverColor(entry.fill) : entry.fill}
                      stroke={selected ? getSelectedStroke(entry.fill) : "#fff"}
                      strokeWidth={selected ? 2 : 1}
                      style={{ cursor: "pointer", transition: "opacity 120ms ease" }}
                    />
                  );
                })}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, item) => {
                  const pct = categoryTotal > 0 ? (Number(value) / categoryTotal) * 100 : 0;
                  const category = item?.name ?? "Category";
                  return [formatCurrency(Number(value), true), `${category} • ${formatPercent(pct)}`];
                }}
                contentStyle={{ borderRadius: 10, border: `1px solid ${NEUTRALS.grid}` }}
              />
              <Legend
                iconType="circle"
                iconSize={9}
                formatter={categoryLegendFormatter}
                wrapperStyle={{ fontSize: 11, color: NEUTRALS.legend, paddingTop: 6 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className={cardClass}>
        <p className="text-sm font-medium">Spend by Source</p>
        <p className="mb-2 text-xs text-muted">Spend by source ({rangeLabel[dateRange]})</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={bySource}>
              <CartesianGrid stroke={NEUTRALS.grid} strokeDasharray="3 3" opacity={0.7} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: NEUTRALS.axis }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={(value: number) => formatCurrency(Number(value), true)} />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                onClick={(payload) => {
                  if (!payload?.name || payload.name === "All sources") return;
                  setActiveSource(String(payload.name));
                  onFilter("source", String(payload.name));
                }}
              >
                {bySource.map((entry) => {
                  const selected = activeSource === entry.name;
                  return (
                    <Cell
                      key={entry.name}
                      fill={selected ? getHoverColor(entry.fill) : entry.fill}
                      stroke={selected ? getSelectedStroke(entry.fill) : "transparent"}
                      strokeWidth={selected ? 2 : 0}
                      style={{ cursor: entry.name === "All sources" ? "default" : "pointer" }}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {sourceLegend.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
              {item.name}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
}

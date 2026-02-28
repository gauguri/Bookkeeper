import { SPEND_ANALYSIS } from "../../data/poMockData";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const fmt = (v: number) => `$${(v / 1000).toFixed(0)}k`;

export default function SpendAnalysisChart() {
  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Spend Analysis — Actual vs Budget vs Forecast</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={SPEND_ANALYSIS} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="budget" name="Budget" fill="hsl(var(--primary) / 0.25)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Line dataKey="forecast" name="Forecast" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="6 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

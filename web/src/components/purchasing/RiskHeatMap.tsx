import { RISK_DATA, RISK_COLORS } from "../../data/poMockData";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function RiskHeatMap() {
  const data = RISK_DATA.map((r) => ({
    x: r.probability * 100,
    y: r.impact * 100,
    z: r.exposure / 1000,
    label: r.label,
    category: r.category,
    level: r.level,
    exposure: r.exposure,
  }));

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Risk Heat Map</h3>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="x" type="number" domain={[0, 100]} name="Probability" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: "Probability", position: "insideBottom", offset: -2, fill: "hsl(var(--muted))", fontSize: 11 }} />
          <YAxis dataKey="y" type="number" domain={[0, 100]} name="Impact" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: "Impact", angle: -90, position: "insideLeft", fill: "hsl(var(--muted))", fontSize: 11 }} />
          <ZAxis dataKey="z" range={[60, 400]} name="Exposure ($k)" />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "Exposure ($k)") return [`$${value.toFixed(0)}k`, "Exposure"];
              if (name === "Probability") return [`${value}%`, name];
              if (name === "Impact") return [`${value}%`, name];
              return [value, name];
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ""}
          />
          <Scatter data={data}>
            {data.map((entry, i) => (
              <Cell key={i} fill={RISK_COLORS[entry.level]} fillOpacity={0.7} stroke={RISK_COLORS[entry.level]} strokeWidth={1} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {(["low", "medium", "high", "critical"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[level] }} />
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

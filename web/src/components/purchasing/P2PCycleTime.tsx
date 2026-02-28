import { P2P_STAGES } from "../../data/poMockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";

export default function P2PCycleTime() {
  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Procure-to-Pay Cycle Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={P2P_STAGES} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} unit=" d" />
          <YAxis dataKey="stage" type="category" tick={{ fill: "hsl(var(--muted))", fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
          <Tooltip />
          <Bar dataKey="avgDays" name="Avg Days" radius={[0, 6, 6, 0]} barSize={20}>
            {P2P_STAGES.map((stage) => (
              <Cell key={stage.stage} fill={stage.bottleneck ? "#ef4444" : "hsl(var(--primary))"} />
            ))}
          </Bar>
          <Bar dataKey="targetDays" name="Target" fill="hsl(var(--border))" radius={[0, 6, 6, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> On Target</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Bottleneck</span>
      </div>
    </div>
  );
}

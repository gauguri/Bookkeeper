import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { VENDOR_COLORS } from "../../data/poMockData";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";

type Supplier = { id: number; name: string };

type VendorScore = {
  name: string;
  quality: number;
  delivery: number;
  price: number;
  responsiveness: number;
  compliance: number;
};

const axes = ["quality", "delivery", "price", "responsiveness", "compliance"] as const;

function scoreFor(supplierId: number, axisIndex: number): number {
  const seed = supplierId * 13 + axisIndex * 7;
  return 65 + (seed * 31 % 30);
}

export default function VendorPerformanceRadar() {
  const [vendors, setVendors] = useState<VendorScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Supplier[]>("/suppliers")
      .then((suppliers) => {
        if (cancelled) return;
        const scores: VendorScore[] = suppliers.slice(0, 5).map((s) => ({
          name: s.name,
          quality: scoreFor(s.id, 0),
          delivery: scoreFor(s.id, 1),
          price: scoreFor(s.id, 2),
          responsiveness: scoreFor(s.id, 3),
          compliance: scoreFor(s.id, 4),
        }));
        setVendors(scores);
      })
      .catch(() => { if (!cancelled) setVendors([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Vendor Performance Radar</h3>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted">Loading supplier data...</p>
        </div>
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Vendor Performance Radar</h3>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted">No supplier data available</p>
        </div>
      </div>
    );
  }

  const data = axes.map((axis) => {
    const entry: Record<string, string | number> = { axis: axis.charAt(0).toUpperCase() + axis.slice(1) };
    vendors.forEach((v) => { entry[v.name] = v[axis]; });
    return entry;
  });

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Vendor Performance Radar</h3>
      <ResponsiveContainer width="100%" height={340}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip />
          {vendors.map((v, i) => (
            <Radar key={v.name} name={v.name} dataKey={v.name} stroke={VENDOR_COLORS[i % VENDOR_COLORS.length]} fill={VENDOR_COLORS[i % VENDOR_COLORS.length]} fillOpacity={0.1} strokeWidth={2} />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

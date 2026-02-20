import Gauge, { type GaugeSegment } from "./Gauge";

// Collection rate: higher is better (% of invoiced revenue collected)
const COLLECTION_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 50, color: "#EF4444" },
  { min: 50, max: 70, color: "#F97316" },
  { min: 70, max: 85, color: "#EAB308" },
  { min: 85, max: 95, color: "#84CC16" },
  { min: 95, max: 100, color: "#22C55E" },
];

const getZone = (pct: number): { label: string; text: string; bg: string } => {
  if (pct >= 95) return { label: "EXCELLENT", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (pct >= 85) return { label: "GOOD", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (pct >= 70) return { label: "OK", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  return { label: "BEHIND", text: "#F87171", bg: "rgba(239, 68, 68, 0.12)" };
};

type CollectionRateGaugeProps = { value: number };

export default function CollectionRateGauge({ value }: CollectionRateGaugeProps) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const zone = getZone(safe);

  return (
    <div className="app-card px-5 pt-5 pb-4" aria-label={`A/R Collection Rate ${safe.toFixed(0)} percent`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">A/R Collection Rate</p>
      <div className="mt-2 px-4">
        <Gauge
          valuePercent={safe}
          min={0}
          max={100}
          thresholds={COLLECTION_SEGMENTS}
          label="Collection rate gauge"
        />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-1">
        <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">
          {safe.toFixed(1)}%
        </p>
        <span
          className="inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: zone.text, backgroundColor: zone.bg }}
        >
          {zone.label}
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">Payments collected vs invoiced (YTD)</p>
    </div>
  );
}

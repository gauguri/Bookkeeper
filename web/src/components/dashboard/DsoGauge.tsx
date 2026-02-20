import Gauge, { type GaugeSegment } from "./Gauge";

// DSO: lower is better. 0-30 excellent, 30-45 good, 45-60 OK, 60-90 concerning, 90+ bad
const DSO_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 30, color: "#22C55E" },
  { min: 30, max: 45, color: "#84CC16" },
  { min: 45, max: 60, color: "#EAB308" },
  { min: 60, max: 90, color: "#F97316" },
  { min: 90, max: 120, color: "#EF4444" },
];

const getZone = (days: number): { label: string; text: string; bg: string } => {
  if (days <= 30) return { label: "GREAT", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (days <= 45) return { label: "GOOD", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (days <= 60) return { label: "OK", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  if (days <= 90) return { label: "SLOW", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  return { label: "CRITICAL", text: "#F87171", bg: "rgba(239, 68, 68, 0.12)" };
};

type DsoGaugeProps = { value: number };

export default function DsoGauge({ value }: DsoGaugeProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(120, Math.max(0, safe));
  const zone = getZone(safe);

  return (
    <div aria-label={`Days Sales Outstanding ${safe.toFixed(0)} days`}>
      <p className="text-xs font-bold uppercase tracking-widest text-muted text-center mb-2">Days Sales Outstanding</p>
      <div className="px-2">
        <Gauge
          valuePercent={clamped}
          min={0}
          max={120}
          thresholds={DSO_SEGMENTS}
          label="DSO gauge"
          size="sm"
        />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-0.5">
        <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">
          {safe.toFixed(0)} <span className="text-base font-semibold text-muted">days</span>
        </p>
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: zone.text, backgroundColor: zone.bg }}
        >
          {zone.label}
        </span>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted">Avg time to collect payment (YTD)</p>
    </div>
  );
}

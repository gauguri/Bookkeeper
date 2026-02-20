import Gauge, { type GaugeSegment } from "./Gauge";

// Inventory turnover: higher is better (how many times inventory sold through)
// Scale 0-12x (monthly turns). Most businesses target 4-8x/year.
const TURNOVER_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 2, color: "#EF4444" },
  { min: 2, max: 4, color: "#F97316" },
  { min: 4, max: 6, color: "#EAB308" },
  { min: 6, max: 8, color: "#84CC16" },
  { min: 8, max: 12, color: "#22C55E" },
];

const getZone = (turns: number): { label: string; text: string; bg: string } => {
  if (turns >= 8) return { label: "FAST", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (turns >= 6) return { label: "GOOD", text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if (turns >= 4) return { label: "OK", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  if (turns >= 2) return { label: "SLOW", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  return { label: "STALE", text: "#F87171", bg: "rgba(239, 68, 68, 0.12)" };
};

type InventoryTurnoverGaugeProps = { value: number };

export default function InventoryTurnoverGauge({ value }: InventoryTurnoverGaugeProps) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const clamped = Math.min(12, safe);
  const zone = getZone(safe);

  return (
    <div className="app-card px-5 pt-5 pb-4" aria-label={`Inventory Turnover ${safe.toFixed(1)}x`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Inventory Turnover</p>
      <div className="mt-2 px-4">
        <Gauge
          valuePercent={clamped}
          min={0}
          max={12}
          thresholds={TURNOVER_SEGMENTS}
          label="Inventory turnover gauge"
        />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-1">
        <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">
          {safe.toFixed(1)}<span className="text-lg font-semibold text-muted">x</span>
        </p>
        <span
          className="inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: zone.text, backgroundColor: zone.bg }}
        >
          {zone.label}
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">COGS / avg inventory value (YTD)</p>
    </div>
  );
}

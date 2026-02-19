import Gauge, { type GaugeSegment } from "./Gauge";

const INVENTORY_GAUGE_MIN = 0;
const INVENTORY_GAUGE_MAX = 200;

export const TARGET_DIO_DAYS = 90;

// Fixed segments: near 100% of target = green (healthy), extremes = red
export const INVENTORY_GAUGE_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 40, color: "#EF4444" },    // Way under-stocked → red
  { min: 40, max: 70, color: "#F97316" },    // Under-stocked → orange
  { min: 70, max: 90, color: "#EAB308" },    // Slightly under → yellow
  { min: 90, max: 120, color: "#22C55E" },   // Healthy range → green
  { min: 120, max: 150, color: "#EAB308" },  // Slightly over → yellow
  { min: 150, max: 175, color: "#F97316" },  // Over-stocked → orange
  { min: 175, max: 200, color: "#EF4444" }   // Way over-stocked → red
];

type InventoryValueGaugeProps = {
  actualInventoryValue: number;
  targetInventoryValue: number;
  inventoryHealthPctRaw: number;
  inventoryHealthPctDisplay: number;
  targetDioDays?: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getHealthColor = (pct: number): { text: string; bg: string } => {
  if (pct >= 90 && pct <= 120) return { text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" };
  if ((pct >= 70 && pct < 90) || (pct > 120 && pct <= 150)) return { text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" };
  return { text: "#F87171", bg: "rgba(239, 68, 68, 0.12)" };
};

const getHealthLabel = (pct: number): string => {
  if (pct >= 90 && pct <= 120) return "HEALTHY";
  if (pct < 90) return "LOW";
  return "OVER";
};

export default function InventoryValueGauge({
  actualInventoryValue,
  targetInventoryValue,
  inventoryHealthPctRaw,
  inventoryHealthPctDisplay,
  targetDioDays = TARGET_DIO_DAYS
}: InventoryValueGaugeProps) {
  const safeActual = toFiniteNumber(actualInventoryValue);
  const safeTarget = toFiniteNumber(targetInventoryValue);
  const safePctRaw = toFiniteNumber(inventoryHealthPctRaw);
  const safePctDisplay = toFiniteNumber(inventoryHealthPctDisplay);
  const colors = getHealthColor(safePctRaw);
  const label = getHealthLabel(safePctRaw);

  return (
    <div className="app-card px-5 pt-5 pb-4" aria-label={`Inventory value ${safePctRaw.toFixed(0)} percent of target`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Inventory Value</p>
      <div className="mt-2 px-4">
        <Gauge
          valuePercent={safePctDisplay}
          min={INVENTORY_GAUGE_MIN}
          max={INVENTORY_GAUGE_MAX}
          thresholds={INVENTORY_GAUGE_SEGMENTS}
          label="Inventory value gauge"
        />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-1">
        <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">{formatCurrency(safeActual)}</p>
        <span
          className="inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: colors.text, backgroundColor: colors.bg }}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        Target: {formatCurrency(safeTarget)} ({targetDioDays} DIO) &middot; {safePctRaw.toFixed(0)}%
      </p>
    </div>
  );
}

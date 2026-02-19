import Gauge, { type GaugeSegment } from "./Gauge";

const INVENTORY_GAUGE_MIN = 0;
const INVENTORY_GAUGE_MAX = 200;

export const TARGET_DIO_DAYS = 90;

export const INVENTORY_GAUGE_SEGMENTS: GaugeSegment[] = [
  { min: 0, max: 60, color: "#EF4444" },
  { min: 60, max: 80, color: "#F97316" },
  { min: 80, max: 110, color: "#FACC15" },
  { min: 110, max: 140, color: "#84CC16" },
  { min: 140, max: 200, color: "#22C55E" }
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

  return (
    <div className="app-card p-5" aria-label={`Inventory value ${safePctRaw.toFixed(0)} percent of target`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">INVENTORY VALUE</p>
      <div className="mt-3 flex items-center justify-center">
        <Gauge
          valuePercent={safePctDisplay}
          min={INVENTORY_GAUGE_MIN}
          max={INVENTORY_GAUGE_MAX}
          thresholds={INVENTORY_GAUGE_SEGMENTS}
          label="Inventory value gauge"
        />
      </div>

      <div className="-mt-1 flex flex-col items-center">
        <p className="text-3xl font-bold tabular-nums text-slate-900">{formatCurrency(safeActual)}</p>
        <p className="text-xs text-muted">Target: {formatCurrency(safeTarget)} ({targetDioDays} DIO)</p>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{safePctRaw.toFixed(0)}% of target</p>
      </div>
    </div>
  );
}

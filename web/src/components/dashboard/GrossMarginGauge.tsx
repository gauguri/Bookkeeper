import Gauge from "./Gauge";
import { formatPercent, getGmZoneColor, getGmZoneLabel, normalizeGrossMargin } from "../../utils/metrics";

type GrossMarginGaugeProps = {
  value?: unknown;
  valuePercent?: unknown;
};

const toNumber = (input: unknown): number => {
  if (typeof input === "number") {
    return input;
  }
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
};

const ZONE_COLORS = {
  red: { text: "#F87171", bg: "rgba(239, 68, 68, 0.12)" },
  amber: { text: "#FBBF24", bg: "rgba(245, 158, 11, 0.12)" },
  green: { text: "#4ADE80", bg: "rgba(34, 197, 94, 0.12)" }
} as const;

export default function GrossMarginGauge({ value, valuePercent }: GrossMarginGaugeProps) {
  const rawValue = value ?? valuePercent;
  const normalizedPercent = normalizeGrossMargin(toNumber(rawValue));
  const zone = getGmZoneColor(normalizedPercent);
  const zoneLabel = getGmZoneLabel(normalizedPercent).toUpperCase();
  const colors = ZONE_COLORS[zone];

  return (
    <div className="app-card px-5 pt-5 pb-4" aria-label={`Gross Margin ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Gross Margin</p>
      <div className="mt-2 px-4">
        <Gauge valuePercent={normalizedPercent} label="Gross Margin gauge" />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-1">
        <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">
          {formatPercent(normalizedPercent, 1)}
        </p>
        <span
          className="inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: colors.text, backgroundColor: colors.bg }}
        >
          {zoneLabel}
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">From invoice snapshots</p>
    </div>
  );
}

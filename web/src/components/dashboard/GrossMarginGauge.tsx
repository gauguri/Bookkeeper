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
    <div aria-label={`Gross Margin ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-xs font-bold uppercase tracking-widest text-muted text-center mb-2">Gross Margin</p>
      <div className="px-2">
        <Gauge valuePercent={normalizedPercent} label="Gross Margin gauge" size="sm" />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-0.5">
        <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">
          {formatPercent(normalizedPercent, 1)}
        </p>
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: colors.text, backgroundColor: colors.bg }}
        >
          {zoneLabel}
        </span>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted">From invoice snapshots</p>
    </div>
  );
}

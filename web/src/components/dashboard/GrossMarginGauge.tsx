import Gauge from "./Gauge";
import { formatPercent, getGmZoneColor, getGmZoneLabel, normalizeGrossMargin } from "../../utils/metrics";

type GrossMarginGaugeProps = {
  value?: unknown;
  valuePercent?: unknown;
  title?: string;
  subtitle?: string;
};

const VALUE_COLOR = "#111827";

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

const ZONE_LABEL_COLORS = {
  red: "#DC2626",
  amber: "#D97706",
  green: "#059669"
} as const;

export default function GrossMarginGauge({ value, valuePercent, title = "GROSS MARGIN", subtitle = "From invoice snapshots" }: GrossMarginGaugeProps) {
  const rawValue = value ?? valuePercent;
  const normalizedPercent = normalizeGrossMargin(toNumber(rawValue));
  const zone = getGmZoneColor(normalizedPercent);
  const zoneLabel = getGmZoneLabel(normalizedPercent).toUpperCase();

  return (
    <div className="app-card p-5" aria-label={`${title} ${formatPercent(normalizedPercent)} in ${zoneLabel} zone`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-3 flex items-center justify-center">
        <Gauge valuePercent={normalizedPercent} label={`${title} gauge`} />
      </div>

      <div className="-mt-1 flex flex-col items-center">
        <p className="text-3xl font-bold tabular-nums" style={{ color: VALUE_COLOR }}>
          {formatPercent(normalizedPercent, 1)}
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ZONE_LABEL_COLORS[zone] }}>
          {zoneLabel}
        </p>
      </div>
      <p className="mt-1 text-center text-xs text-muted">{subtitle}</p>
    </div>
  );
}

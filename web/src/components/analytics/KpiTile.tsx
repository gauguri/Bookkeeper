import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KpiData } from "../../hooks/useAnalytics";
import { formatKpiValue, formatPercent } from "../../utils/formatters";
import { getDirectionColorClass, getStatusBorderClass } from "../../utils/colorScales";

type Props = {
  kpi: KpiData;
  onClick?: () => void;
  ariaLabel?: string;
  /** KPIs where "up" is bad (e.g., DSO, expenses) */
  invertDirection?: boolean;
};

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 28;
  const w = 80;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}

const warnedKpis = new Set<string>();

function guardNaNDisplay(value: string, kpiKey: string): string {
  if (!value.includes("NaN")) return value;
  if (!warnedKpis.has(kpiKey)) {
    warnedKpis.add(kpiKey);
    console.warn(`[KpiTile] Replaced invalid KPI display for ${kpiKey}`);
  }
  return "$0.00";
}

const DirectionIcon = ({ direction }: { direction: string }) => {
  if (direction === "up") return <TrendingUp className="h-3.5 w-3.5" />;
  if (direction === "down") return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
};

export default function KpiTile({ kpi, onClick, ariaLabel, invertDirection = false }: Props) {
  const navigate = useNavigate();
  const dirColorClass = getDirectionColorClass(kpi.direction, invertDirection);
  const borderClass = getStatusBorderClass(kpi.status);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (kpi.drill_down_url) {
      const path = kpi.drill_down_url.replace("/api/analytics", "/analytics");
      navigate(path);
    }
  };

  const displayValue = guardNaNDisplay(formatKpiValue(kpi.current_value, kpi.unit), kpi.kpi_key);

  return (
    <button
      type="button"
      onClick={handleClick}
      role="link"
      aria-label={ariaLabel}
      className={`app-card flex w-full cursor-pointer flex-col gap-2 border-l-4 p-4 text-left transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${borderClass}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{kpi.label}</p>
        <Sparkline values={kpi.sparkline} />
      </div>
      <p className="text-2xl font-bold">{displayValue}</p>
      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1 text-sm font-medium ${dirColorClass}`}>
          <DirectionIcon direction={kpi.direction} />
          {formatPercent(Math.abs(kpi.change_percent))}
        </span>
        {kpi.comparison_period && (
          <span className="text-xs text-muted">vs {kpi.comparison_period}</span>
        )}
        {kpi.target_value != null && (
          <span className="text-xs text-muted">target: {formatKpiValue(kpi.target_value, kpi.unit)}</span>
        )}
      </div>
    </button>
  );
}

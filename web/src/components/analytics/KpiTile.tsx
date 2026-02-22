import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KpiData } from "../../hooks/useAnalytics";
import { formatKpiValue, formatPercent } from "../../utils/formatters";
import { getDirectionColorClass, getStatusBorderClass } from "../../utils/colorScales";

type Props = {
  kpi: KpiData;
  onClick?: () => void;
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

const DirectionIcon = ({ direction }: { direction: string }) => {
  if (direction === "up") return <TrendingUp className="h-3.5 w-3.5" />;
  if (direction === "down") return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
};

export default function KpiTile({ kpi, onClick, invertDirection = false }: Props) {
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

  return (
    <button
      onClick={handleClick}
      className={`app-card flex flex-col gap-2 p-4 text-left transition-all hover:shadow-lg border-l-4 ${borderClass} cursor-pointer w-full`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{kpi.label}</p>
        <Sparkline values={kpi.sparkline} />
      </div>
      <p className="text-2xl font-bold">{formatKpiValue(kpi.current_value, kpi.unit)}</p>
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

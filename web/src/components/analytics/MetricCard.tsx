import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatKpiValue, formatPercent } from "../../utils/formatters";
import { getDirectionColorClass, getStatusBgClass } from "../../utils/colorScales";
import type { KpiData } from "../../hooks/useAnalytics";

type Props = {
  kpi: KpiData;
  subtitle?: string;
  invertDirection?: boolean;
};

export default function MetricCard({ kpi, subtitle, invertDirection = false }: Props) {
  const dirColorClass = getDirectionColorClass(kpi.direction, invertDirection);

  return (
    <div className={`app-card p-5 ${getStatusBgClass(kpi.status)}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{kpi.label}</p>
      <p className="mt-2 text-3xl font-bold">{formatKpiValue(kpi.current_value, kpi.unit)}</p>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}

      <div className="mt-3 flex items-center gap-2">
        <span className={`flex items-center gap-1 text-sm font-semibold ${dirColorClass}`}>
          {kpi.direction === "up" && <TrendingUp className="h-4 w-4" />}
          {kpi.direction === "down" && <TrendingDown className="h-4 w-4" />}
          {kpi.direction === "flat" && <Minus className="h-4 w-4" />}
          {formatPercent(Math.abs(kpi.change_percent))}
        </span>
        <span className="text-xs text-muted">vs prior period</span>
      </div>

      {kpi.target_value != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Progress to target</span>
            <span>{formatKpiValue(kpi.target_value, kpi.unit)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  100,
                  kpi.target_value !== 0
                    ? Math.abs((kpi.current_value / kpi.target_value) * 100)
                    : 0
                )}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

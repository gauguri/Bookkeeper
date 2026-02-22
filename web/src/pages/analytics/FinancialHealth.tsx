import { useFinancialHealth } from "../../hooks/useAnalytics";
import KpiTile from "../../components/analytics/KpiTile";
import GaugeChart from "../../components/analytics/GaugeChart";
import { COLOR } from "../../utils/colorScales";
import { AlertTriangle } from "lucide-react";

const RATIO_GAUGE_CONFIG: Record<string, { min: number; max: number; zones: { min: number; max: number; color: string }[] }> = {
  current_ratio: {
    min: 0, max: 4,
    zones: [
      { min: 0, max: 1, color: COLOR.negative },
      { min: 1, max: 1.5, color: COLOR.warning },
      { min: 1.5, max: 4, color: COLOR.positive },
    ],
  },
  quick_ratio: {
    min: 0, max: 3,
    zones: [
      { min: 0, max: 0.5, color: COLOR.negative },
      { min: 0.5, max: 1, color: COLOR.warning },
      { min: 1, max: 3, color: COLOR.positive },
    ],
  },
  gross_profit_margin: {
    min: 0, max: 100,
    zones: [
      { min: 0, max: 30, color: COLOR.negative },
      { min: 30, max: 50, color: COLOR.warning },
      { min: 50, max: 100, color: COLOR.positive },
    ],
  },
  net_profit_margin: {
    min: -20, max: 50,
    zones: [
      { min: -20, max: 0, color: COLOR.negative },
      { min: 0, max: 10, color: COLOR.warning },
      { min: 10, max: 50, color: COLOR.positive },
    ],
  },
};

export default function FinancialHealth() {
  const { data, isLoading, error } = useFinancialHealth();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Financial Health</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="app-card h-40 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load financial health data.</p>
      </div>
    );
  }

  const scoreColor = data.status === "good" ? "text-green-600" : data.status === "warning" ? "text-amber-600" : "text-red-600";
  const scoreBg = data.status === "good" ? "bg-green-50 dark:bg-green-900/20" : data.status === "warning" ? "bg-amber-50 dark:bg-amber-900/20" : "bg-red-50 dark:bg-red-900/20";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financial Health Scorecard</h1>

      {/* Overall Score */}
      <div className={`app-card flex items-center gap-6 p-6 ${scoreBg}`}>
        <div className={`text-5xl font-black ${scoreColor}`}>{data.score}</div>
        <div>
          <p className="text-lg font-semibold">Overall Health Score</p>
          <p className="text-sm text-muted capitalize">{data.status} — {data.ratios.filter(r => r.status === "good").length}/{data.ratios.length} ratios in healthy range</p>
        </div>
      </div>

      {/* Gauge Charts */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {data.ratios
          .filter((r) => RATIO_GAUGE_CONFIG[r.kpi_key])
          .map((ratio) => {
            const config = RATIO_GAUGE_CONFIG[ratio.kpi_key];
            return (
              <div key={ratio.kpi_key} className="app-card flex items-center justify-center p-4">
                <GaugeChart
                  value={ratio.current_value}
                  min={config.min}
                  max={config.max}
                  target={ratio.target_value}
                  label={ratio.label}
                  unit={ratio.unit}
                  zones={config.zones}
                />
              </div>
            );
          })}
      </div>

      {/* Ratio Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.ratios.map((ratio) => (
          <KpiTile key={ratio.kpi_key} kpi={ratio} />
        ))}
      </div>
    </div>
  );
}

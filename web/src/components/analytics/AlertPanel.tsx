import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import type { AnomalyItem } from "../../hooks/useAnalytics";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  anomalies: AnomalyItem[];
  title?: string;
};

export default function AlertPanel({ anomalies, title = "Alerts & Anomalies" }: Props) {
  if (!anomalies.length) {
    return (
      <div className="app-card p-4">
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted">No anomalies detected. All transactions look normal.</p>
      </div>
    );
  }

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {anomalies.length}
        </span>
      </div>
      <div className="space-y-2">
        {anomalies.map((anomaly) => (
          <div
            key={anomaly.id}
            className={`rounded-lg border p-3 ${
              anomaly.severity === "high"
                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium">{anomaly.description}</p>
                <p className="mt-1 text-xs text-muted">{anomaly.reason}</p>
              </div>
              <span className="ml-2 shrink-0 text-sm font-bold">{formatCurrency(anomaly.value, true)}</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
              <span>{anomaly.date}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                Z-score: {anomaly.z_score}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 ${
                  anomaly.severity === "high"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                }`}
              >
                {anomaly.severity}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

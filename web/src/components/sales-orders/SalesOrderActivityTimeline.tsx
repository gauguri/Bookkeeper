import { CheckCircle2, Clock3, XCircle, AlertTriangle } from "lucide-react";
import type { TimelineEntry } from "../../hooks/useSalesRequests";

type Props = {
  timeline: TimelineEntry[];
  formatDate: (value?: string | null) => string;
  className?: string;
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "border-slate-300 bg-slate-100 text-slate-600",
  QUOTED: "border-amber-300 bg-amber-100 text-amber-600",
  CONFIRMED: "border-blue-300 bg-blue-100 text-blue-600",
  INVOICED: "border-indigo-300 bg-indigo-100 text-indigo-600",
  SHIPPED: "border-purple-300 bg-purple-100 text-purple-600",
  CLOSED: "border-emerald-300 bg-emerald-100 text-emerald-600",
  LOST: "border-red-300 bg-red-100 text-red-600",
  CANCELLED: "border-gray-300 bg-gray-100 text-gray-500",
};

function getDuration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  if (diff < 0 || Number.isNaN(diff)) return null;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(diff / 60000);
  return `${mins}m`;
}

export default function SalesOrderActivityTimeline({
  timeline,
  formatDate,
  className = "",
}: Props) {
  // Progress bar: how far through the flow
  const completedCount = timeline.filter((e) => e.completed).length;
  const totalCount = timeline.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className={`app-card space-y-4 p-5 ${className}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Order Activity
        </p>
        <h3 className="text-lg font-semibold">Timeline</h3>
      </div>

      {/* Compact progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted">
          <span>Progress</span>
          <span>
            {completedCount}/{totalCount} steps
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Vertical timeline */}
      <ol className="relative space-y-0">
        {timeline.map((entry, idx) => {
          const isLast = idx === timeline.length - 1;
          const isTerminal = entry.status === "LOST" || entry.status === "CANCELLED";
          const colors = STATUS_COLORS[entry.status] ?? STATUS_COLORS.NEW;
          const duration =
            idx > 0
              ? getDuration(timeline[idx - 1].occurred_at, entry.occurred_at)
              : null;

          return (
            <li key={entry.status} className="relative flex gap-3">
              {/* Connecting line */}
              {!isLast && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
              )}

              {/* Icon */}
              <div className="relative z-10 flex-shrink-0 pt-0.5">
                {entry.completed ? (
                  isTerminal ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-300 bg-red-100">
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                    </div>
                  ) : (
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${colors}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                  )
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-border bg-surface">
                    <Clock3 className="h-3.5 w-3.5 text-muted" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      entry.current
                        ? "font-bold"
                        : entry.completed
                          ? "font-medium"
                          : "text-muted"
                    }`}
                  >
                    {entry.label}
                  </span>
                  {entry.current && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="tabular-nums">
                    {entry.occurred_at
                      ? formatDate(entry.occurred_at)
                      : "Pending"}
                  </span>
                  {duration && (
                    <span className="text-[10px] text-muted/60">
                      +{duration}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { CheckCircle2, Clock3 } from "lucide-react";

type TimelineEntry = {
  status: "NEW" | "QUOTED" | "CONFIRMED" | "INVOICED" | "SHIPPED" | "CLOSED" | "LOST" | "CANCELLED";
  label: string;
  occurred_at: string | null;
  completed: boolean;
  current: boolean;
};

type Props = {
  timeline: TimelineEntry[];
  formatDate: (value?: string | null) => string;
  className?: string;
};

export default function SalesRequestTimeline({ timeline, formatDate, className = "" }: Props) {
  return (
    <aside className={`app-card space-y-4 p-5 ${className}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Workflow timeline</p>
        <h3 className="text-lg font-semibold">Timeline</h3>
      </div>
      <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {timeline.map((entry) => (
          <li
            key={entry.status}
            className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              {entry.completed ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <Clock3 className="h-4 w-4 text-muted" />
              )}
              <span className={entry.current ? "font-semibold" : "text-muted"}>{entry.label}</span>
            </div>
            <span className="text-xs tabular-nums text-muted">{entry.occurred_at ? formatDate(entry.occurred_at) : "Pending"}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

import { formatCurrency } from "../../utils/formatters";

const STATUS_FLOW = ["NEW", "QUOTED", "CONFIRMED", "INVOICED", "SHIPPED", "CLOSED"];
const TERMINAL = ["LOST", "CANCELLED"];

const COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: "bg-slate-400", text: "text-white" },
  QUOTED: { bg: "bg-amber-400", text: "text-white" },
  CONFIRMED: { bg: "bg-blue-500", text: "text-white" },
  INVOICED: { bg: "bg-indigo-500", text: "text-white" },
  SHIPPED: { bg: "bg-purple-500", text: "text-white" },
  CLOSED: { bg: "bg-emerald-500", text: "text-white" },
  LOST: { bg: "bg-red-400", text: "text-white" },
  CANCELLED: { bg: "bg-gray-300", text: "text-gray-600" },
};

type Props = {
  ordersByStatus: Record<string, number>;
  pipelineValue: number;
  activeStatus?: string[];
  onStatusClick: (status: string) => void;
};

export default function SalesOrderPipelineBar({
  ordersByStatus,
  pipelineValue,
  activeStatus,
  onStatusClick,
}: Props) {
  const allStatuses = [...STATUS_FLOW, ...TERMINAL];
  const total = allStatuses.reduce((s, st) => s + (ordersByStatus[st] || 0), 0);

  return (
    <div className="app-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Sales Pipeline
        </p>
        <p className="text-sm font-semibold tabular-nums">
          {formatCurrency(Number(pipelineValue))} in pipeline
        </p>
      </div>

      {/* Bar */}
      {total > 0 && (
        <div className="flex h-8 overflow-hidden rounded-lg">
          {allStatuses.map((st) => {
            const count = ordersByStatus[st] || 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            const color = COLORS[st] ?? COLORS.NEW;
            const isActive = !activeStatus || activeStatus.length === 0 || activeStatus.includes(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => onStatusClick(st)}
                className={`flex items-center justify-center transition-opacity ${color.bg} ${color.text} text-xs font-semibold ${
                  isActive ? "opacity-100" : "opacity-40"
                } hover:opacity-100`}
                style={{ width: `${Math.max(pct, 4)}%` }}
                title={`${st}: ${count} orders`}
              >
                {pct > 6 ? count : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {allStatuses.map((st) => {
          const count = ordersByStatus[st] || 0;
          if (count === 0) return null;
          const color = COLORS[st] ?? COLORS.NEW;
          const isActive = !activeStatus || activeStatus.length === 0 || activeStatus.includes(st);
          return (
            <button
              key={st}
              type="button"
              onClick={() => onStatusClick(st)}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${
                isActive ? "opacity-100 font-medium" : "opacity-50"
              } hover:opacity-100`}
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color.bg}`} />
              {st.replace(/_/g, " ")} ({count})
            </button>
          );
        })}
      </div>
    </div>
  );
}

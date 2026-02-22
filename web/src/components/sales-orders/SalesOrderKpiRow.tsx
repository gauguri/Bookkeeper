import {
  DollarSign,
  ClipboardList,
  TrendingUp,
  BarChart3,
  Clock,
  CalendarClock,
} from "lucide-react";
import type { SalesRequestKpis } from "../../hooks/useSalesRequests";
import { formatCurrency, formatPercent } from "../../utils/formatters";

const cards = (k: SalesRequestKpis) => [
  {
    label: "Total Amount",
    value: formatCurrency(Number(k.total_amount), true),
    icon: DollarSign,
    iconBg: "bg-emerald-500/10 text-emerald-600",
  },
  {
    label: "Line Items",
    value: String(k.line_count),
    icon: ClipboardList,
    iconBg: "bg-blue-500/10 text-blue-600",
  },
  {
    label: "Avg Line Value",
    value: k.avg_line_value != null ? formatCurrency(Number(k.avg_line_value), true) : "\u2014",
    icon: TrendingUp,
    iconBg: "bg-violet-500/10 text-violet-600",
  },
  {
    label: "Est. Margin",
    value: k.estimated_margin_percent != null ? formatPercent(Number(k.estimated_margin_percent)) : "\u2014",
    sub: k.estimated_margin_amount != null ? formatCurrency(Number(k.estimated_margin_amount), true) : undefined,
    icon: BarChart3,
    iconBg:
      k.estimated_margin_percent != null && Number(k.estimated_margin_percent) >= 0
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-red-500/10 text-red-600",
  },
  {
    label: "Days Open",
    value: `${k.days_open}d`,
    icon: Clock,
    iconBg: k.days_open > 14 ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600",
  },
  {
    label: "Fulfillment",
    value:
      k.fulfillment_days_remaining != null
        ? k.fulfillment_days_remaining >= 0
          ? `${k.fulfillment_days_remaining}d left`
          : `${Math.abs(k.fulfillment_days_remaining)}d overdue`
        : "\u2014",
    icon: CalendarClock,
    iconBg:
      k.fulfillment_days_remaining != null && k.fulfillment_days_remaining < 0
        ? "bg-red-500/10 text-red-600"
        : "bg-sky-500/10 text-sky-600",
  },
];

type Props = { kpis: SalesRequestKpis };

export default function SalesOrderKpiRow({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards(kpis).map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="app-card flex items-start gap-3 p-4">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">
                {c.label}
              </p>
              <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{c.value}</p>
              {c.sub && <p className="text-xs text-muted">{c.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

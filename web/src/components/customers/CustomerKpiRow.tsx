import { DollarSign, Clock, TrendingUp, FileText, CreditCard, AlertTriangle } from "lucide-react";
import type { CustomerKpis } from "../../hooks/useCustomers";
import { formatCurrency, formatPercent, formatDays } from "../../utils/formatters";
import PaymentScoreBadge from "./PaymentScoreBadge";

type Props = { kpis: CustomerKpis };

export default function CustomerKpiRow({ kpis }: Props) {
  const cards = [
    {
      label: "Lifetime Revenue",
      value: formatCurrency(kpis.lifetime_revenue),
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "YTD Revenue",
      value: formatCurrency(kpis.ytd_revenue),
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Outstanding A/R",
      value: formatCurrency(kpis.outstanding_ar),
      icon: FileText,
      color: kpis.outstanding_ar > 0 ? "text-amber-600" : "text-green-600",
      bgColor: kpis.outstanding_ar > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Avg Days to Pay",
      value: kpis.avg_days_to_pay != null ? formatDays(kpis.avg_days_to_pay) : "N/A",
      icon: Clock,
      color: (kpis.avg_days_to_pay ?? 0) > 45 ? "text-red-600" : "text-blue-600",
      bgColor: (kpis.avg_days_to_pay ?? 0) > 45 ? "bg-red-50 dark:bg-red-900/20" : "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Gross Margin",
      value: kpis.gross_margin_percent != null ? formatPercent(kpis.gross_margin_percent) : "N/A",
      icon: TrendingUp,
      color: "text-violet-600",
      bgColor: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      label: "Overdue",
      value: formatCurrency(kpis.overdue_amount),
      icon: AlertTriangle,
      color: kpis.overdue_amount > 0 ? "text-red-600" : "text-green-600",
      bgColor: kpis.overdue_amount > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="app-card flex items-start gap-3 p-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${card.bgColor}`}>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted truncate">{card.label}</p>
            <p className="text-lg font-bold leading-tight">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

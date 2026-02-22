import {
  DollarSign, TrendingUp, Package, ShoppingCart, Users, BarChart3,
} from "lucide-react";
import type { ItemKpis } from "../../hooks/useItems";
import { formatCurrency, formatCompact, formatPercent } from "../../utils/formatters";
import StockStatusBadge from "./StockStatusBadge";

type Props = { kpis: ItemKpis };

export default function ItemKpiRow({ kpis }: Props) {
  const cards: { label: string; value: string; sub?: string; icon: React.ElementType; iconBg: string; iconColor: string }[] = [
    {
      label: "Total Revenue",
      value: formatCompact(Number(kpis.total_revenue)),
      sub: `YTD ${formatCompact(Number(kpis.ytd_revenue))}`,
      icon: DollarSign,
      iconBg: "bg-green-50 dark:bg-green-900/20",
      iconColor: "text-green-600",
    },
    {
      label: "Units Sold",
      value: Number(kpis.units_sold_total).toLocaleString(),
      sub: `YTD ${Number(kpis.units_sold_ytd).toLocaleString()}`,
      icon: ShoppingCart,
      iconBg: "bg-blue-50 dark:bg-blue-900/20",
      iconColor: "text-blue-600",
    },
    {
      label: "Avg Sell Price",
      value: kpis.avg_selling_price != null ? formatCurrency(Number(kpis.avg_selling_price), true) : "—",
      icon: TrendingUp,
      iconBg: "bg-violet-50 dark:bg-violet-900/20",
      iconColor: "text-violet-600",
    },
    {
      label: "Gross Margin",
      value: kpis.gross_margin_percent != null ? formatPercent(kpis.gross_margin_percent) : "—",
      icon: BarChart3,
      iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
      iconColor: "text-emerald-600",
    },
    {
      label: "Available Qty",
      value: Number(kpis.available_qty).toLocaleString(),
      sub: `On hand ${Number(kpis.on_hand_qty).toLocaleString()}`,
      icon: Package,
      iconBg: "bg-amber-50 dark:bg-amber-900/20",
      iconColor: "text-amber-600",
    },
    {
      label: "Customers",
      value: kpis.unique_customers.toString(),
      sub: `${kpis.total_invoices} invoices`,
      icon: Users,
      iconBg: "bg-cyan-50 dark:bg-cyan-900/20",
      iconColor: "text-cyan-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="app-card flex items-center gap-3 p-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg}`}>
            <card.icon className={`h-5 w-5 ${card.iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">{card.label}</p>
            <p className="text-lg font-bold leading-tight">{card.value}</p>
            {card.sub && <p className="text-[10px] text-muted">{card.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

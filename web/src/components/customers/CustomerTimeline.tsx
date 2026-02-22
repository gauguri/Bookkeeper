import { FileText, CreditCard, MessageSquare, Bell, Truck } from "lucide-react";
import type { ActivityItem } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/formatters";

const ICON_MAP: Record<string, React.ElementType> = {
  invoice: FileText,
  payment: CreditCard,
  note: MessageSquare,
  reminder: Bell,
  shipped: Truck,
};

const TYPE_COLORS: Record<string, string> = {
  invoice_created: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  invoice_sent: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
  invoice_shipped: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
  invoice_paid: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  payment_received: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  note_added: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  reminder_sent: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  note: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function RelativeTime({ date: dateStr }: { date: string }) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return <span>Today</span>;
  if (days === 1) return <span>Yesterday</span>;
  if (days < 30) return <span>{days}d ago</span>;
  if (days < 365) return <span>{Math.floor(days / 30)}mo ago</span>;
  return <span>{d.toLocaleDateString()}</span>;
}

type Props = { activities: ActivityItem[]; maxItems?: number };

export default function CustomerTimeline({ activities, maxItems = 20 }: Props) {
  const items = activities.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

      {items.map((item, i) => {
        const Icon = ICON_MAP[item.icon] || FileText;
        const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.note_added;

        return (
          <div key={item.id} className="relative flex gap-4 py-3 pl-0">
            {/* Icon */}
            <div className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${colorClass}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <span className="flex-shrink-0 text-xs text-muted">
                  <RelativeTime date={item.date} />
                </span>
              </div>
              <p className="text-xs text-muted truncate">{item.description}</p>
              {item.amount != null && (
                <p className="mt-0.5 text-xs font-semibold">{formatCurrency(item.amount, true)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

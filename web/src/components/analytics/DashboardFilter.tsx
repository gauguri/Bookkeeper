import { Calendar } from "lucide-react";

type Period = "current_month" | "current_quarter" | "ytd" | "last_month" | "last_quarter" | "last_year" | "custom";

type Props = {
  period: string;
  onPeriodChange: (period: string) => void;
};

const PERIODS: { value: Period; label: string }[] = [
  { value: "current_month", label: "MTD" },
  { value: "current_quarter", label: "QTD" },
  { value: "ytd", label: "YTD" },
  { value: "last_month", label: "Last Month" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "last_year", label: "Last Year" },
];

export default function DashboardFilter({ period, onPeriodChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4 text-muted" />
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onPeriodChange(p.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            period === p.value
              ? "bg-primary text-primary-foreground shadow-glow"
              : "bg-gray-100 text-muted hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

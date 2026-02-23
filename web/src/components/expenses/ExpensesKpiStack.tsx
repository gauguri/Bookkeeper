import { Entry } from "./types";

type Props = {
  entries: Entry[];
  onApplyFilter: (filter: string) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export default function ExpensesKpiStack({ entries, onApplyFilter }: Props) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const isInRange = (date: string, start: Date) => new Date(date) >= start;
  const mtd = entries.filter((entry) => isInRange(entry.date, startMonth));
  const qtd = entries.filter((entry) => isInRange(entry.date, startQuarter));
  const manualCount = entries.filter((entry) => entry.source_type === "MANUAL").length;

  const cards = [
    { label: "MTD Spend", value: formatCurrency(mtd.reduce((sum, item) => sum + Number(item.amount), 0)), filter: "mtd" },
    { label: "QTD Spend", value: formatCurrency(qtd.reduce((sum, item) => sum + Number(item.amount), 0)), filter: "qtd" },
    { label: "# Entries (MTD)", value: String(mtd.length), filter: "mtd-count" },
    { label: "Manual count", value: String(manualCount), filter: "manual" }
  ];

  return (
    <div className="space-y-2">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          className="bedrock-surface bedrock-focus w-full rounded-xl px-3 py-3 text-left transition hover:-translate-y-0.5"
          onClick={() => onApplyFilter(card.filter)}
        >
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--bedrock-muted)]">{card.label}</p>
          <p className="mt-1 text-lg font-semibold">{card.value}</p>
        </button>
      ))}
    </div>
  );
}

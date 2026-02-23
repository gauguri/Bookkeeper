import { LayoutGrid, ListFilter } from "lucide-react";
import { DateRange, Density } from "./types";

type Props = {
  search: string;
  dateRange: DateRange;
  density: Density;
  onSearch: (value: string) => void;
  onDateRange: (value: DateRange) => void;
  onDensity: (value: Density) => void;
  onToggleColumns: () => void;
};

export default function ExpensesHeaderBar({ search, dateRange, density, onSearch, onDateRange, onDensity, onToggleColumns }: Props) {
  return (
    <header className="bedrock-surface rounded-2xl p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <p className="text-sm text-[var(--bedrock-muted)]">High-fidelity spend operations and controls.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
          <input
            aria-label="Search expenses"
            className="bedrock-focus w-full rounded-xl border border-[var(--bedrock-border)] bg-black/20 px-3 py-2 text-sm"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search memo, payee, account"
          />
          <select aria-label="Date range" className="bedrock-focus rounded-xl border border-[var(--bedrock-border)] bg-black/20 px-3 py-2 text-sm" value={dateRange} onChange={(event) => onDateRange(event.target.value as DateRange)}>
            <option value="mtd">MTD</option><option value="qtd">QTD</option><option value="ytd">YTD</option><option value="custom">Custom</option>
          </select>
          <select aria-label="Density" className="bedrock-focus rounded-xl border border-[var(--bedrock-border)] bg-black/20 px-3 py-2 text-sm" value={density} onChange={(event) => onDensity(event.target.value as Density)}>
            <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
          </select>
          <button type="button" onClick={onToggleColumns} className="bedrock-focus inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--bedrock-border)] px-3 py-2 text-sm hover:bg-[var(--pl-hover)]">
            <LayoutGrid size={16} /> Columns <ListFilter size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

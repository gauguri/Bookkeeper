import { Download, Filter, Plus, Upload } from "lucide-react";
import ExpensesKpiStack from "./ExpensesKpiStack";
import { Entry } from "./types";

type Props = {
  entries: Entry[];
  currentView: string;
  onViewChange: (view: string) => void;
  onQuickAction: (action: "new" | "export" | "import") => void;
  onApplyFilter: (filter: string) => void;
};

const views = [
  ["all", "All entries"],
  ["manual", "Manual"],
  ["purchase", "Purchase Orders"],
  ["mtd", "This Month"],
  ["unreviewed", "Unreviewed"]
] as const;

export default function ExpensesRail({ entries, currentView, onViewChange, onQuickAction, onApplyFilter }: Props) {
  return (
    <aside className="bedrock-surface hidden h-full rounded-2xl p-5 lg:flex lg:flex-col lg:gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--bedrock-muted)]">Expenses</p>
        <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.08em]">EXPENSES</h2>
        <p className="mt-1 text-sm text-[var(--bedrock-muted)]">Control spend. Maintain accuracy.</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" className="app-button bedrock-focus !bg-[var(--bedrock-accent)]" onClick={() => onQuickAction("new")}><Plus size={16} />New expense</button>
        <button type="button" className="app-button-secondary bedrock-focus !border-[var(--bedrock-border)] !bg-transparent !text-[var(--bedrock-text)] hover:!bg-[var(--pl-hover)]" onClick={() => onQuickAction("export")}><Download size={16} />Export</button>
        <button type="button" className="app-button-secondary bedrock-focus !border-[var(--bedrock-border)] !bg-transparent !text-[var(--bedrock-text)] hover:!bg-[var(--pl-hover)]" onClick={() => onQuickAction("import")}><Upload size={16} />Import</button>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--bedrock-muted)]">Saved views</p>
        <div className="space-y-1">
          {views.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`bedrock-focus flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${currentView === value ? "bg-[var(--pl-hover-strong)]" : "hover:bg-[var(--pl-hover)]"}`}
              onClick={() => onViewChange(value)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="bedrock-focus inline-flex items-center gap-2 rounded-xl border border-[var(--bedrock-border)] px-3 py-2 text-sm hover:bg-[var(--pl-hover)]"
        onClick={() => onApplyFilter("advanced")}
      >
        <Filter size={16} /> Advanced Filters
      </button>

      <ExpensesKpiStack entries={entries} onApplyFilter={onApplyFilter} />
    </aside>
  );
}

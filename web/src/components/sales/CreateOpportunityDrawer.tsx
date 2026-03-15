import { BriefcaseBusiness, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api";
import { formatCurrency } from "../../utils/formatters";
import EntityCreateDrawer from "./EntityCreateDrawer";
import { ListResponse, SalesAccount, SalesOpportunity } from "./types";

type Props = { open: boolean; onClose: () => void; onCreated: (id: number, saveNew?: boolean) => void; mode?: "overlay" | "inline" };

type FieldShellProps = {
  label: string;
  help: string;
  children: React.ReactNode;
  className?: string;
};

const STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const STAGE_PROB: Record<string, number> = { Prospecting: 10, Qualification: 25, Proposal: 50, Negotiation: 75, "Closed Won": 100, "Closed Lost": 0 };
const EMPTY_FORM = { account_id: "", name: "", stage: "Qualification", expected_close_date: "", amount_estimate: "0", probability: "25", source: "", next_step: "", notes: "" };

function FieldShell({ label, help, children, className = "" }: FieldShellProps) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      {children}
      <p className="text-xs text-muted">{help}</p>
    </label>
  );
}

export default function CreateOpportunityDrawer({ open, onClose, onCreated, mode = "overlay" }: Props) {
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [pipeline, setPipeline] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then(setPipeline);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      const response = await apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?search=&page=0&page_size=25`);
      setAccounts(response.items);
    }, 300);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setForm((previous) => ({ ...previous, probability: String(STAGE_PROB[previous.stage] ?? 25) }));
  }, [form.stage]);

  const defaultName = useMemo(() => {
    const accountName = accounts.find((account) => String(account.id) === form.account_id)?.name;
    return accountName ? `${accountName} - ${new Date().toLocaleString("default", { month: "short" })}` : "";
  }, [accounts, form.account_id]);

  const warning = Math.abs(Number(form.probability) - (STAGE_PROB[form.stage] ?? 0)) > 15;
  const totals = pipeline.items.reduce((accumulator, opportunity) => accumulator + opportunity.amount_estimate, 0);

  const create = async (saveNew?: boolean) => {
    if (!form.account_id || !form.name.trim() || !form.expected_close_date) {
      setError("Account, opportunity name, and close date are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<SalesOpportunity>("/sales/opportunities", {
        method: "POST",
        body: JSON.stringify({
          account_id: Number(form.account_id),
          name: form.name,
          stage: form.stage,
          expected_close_date: form.expected_close_date,
          amount_estimate: Number(form.amount_estimate || 0),
          probability: Number(form.probability || 0),
          source: form.source || null,
          next_step: form.next_step || null,
        }),
      });
      if (saveNew) setForm(EMPTY_FORM);
      onCreated(created.id, saveNew);
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityCreateDrawer
      open={open}
      title="New Opportunity"
      description="Create a pipeline record with guided defaults."
      icon={<BriefcaseBusiness className="h-5 w-5" />}
      steps={["Overview", "Details", "Review"]}
      step={step}
      onStepChange={setStep}
      dirty={Boolean(form.account_id || form.name)}
      error={error || (warning ? "Probability differs from stage baseline." : "")}
      onClose={onClose}
      onSaveDraft={() => localStorage.setItem("draft:create-opportunity", JSON.stringify(form))}
      onSaveNew={() => create(true)}
      onCreate={() => create(false)}
      creating={saving}
      mode={mode}
      insights={
        <div className="space-y-3">
          <h4 className="font-semibold">Pipeline snapshot</h4>
          <p className="text-xs text-muted">My pipeline total</p>
          <p className="text-xl font-semibold">{formatCurrency(totals)}</p>
          <div className="space-y-1 text-xs">
            {Object.entries(STAGE_PROB).map(([stage, probability]) => (
              <div key={stage} className="flex justify-between">
                <span>{stage}</span>
                <span>{probability}%</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FieldShell label="Sales Account" help="The commercial account or customer this opportunity belongs to.">
          <select
            data-autofocus="true"
            className="app-select"
            value={form.account_id}
            onChange={(e) => setForm((previous) => ({ ...previous, account_id: e.target.value, name: previous.name || defaultName }))}
          >
            <option value="">Select account*</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label="Opportunity Name" help="A short deal name so the pipeline is easy to scan and search.">
          <input
            className="app-input"
            placeholder="Opportunity name*"
            value={form.name}
            onChange={(e) => setForm((previous) => ({ ...previous, name: e.target.value || defaultName }))}
          />
        </FieldShell>

        <FieldShell label="Stage" help="The current pipeline stage. This drives the default close probability.">
          <select className="app-select" value={form.stage} onChange={(e) => setForm((previous) => ({ ...previous, stage: e.target.value }))}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label="Expected Close Date" help="The date you expect the deal to be won or lost.">
          <input className="app-input" type="date" value={form.expected_close_date} onChange={(e) => setForm((previous) => ({ ...previous, expected_close_date: e.target.value }))} />
        </FieldShell>

        <FieldShell label="Amount Estimate" help="Estimated revenue value of the deal if it closes successfully.">
          <input className="app-input" type="number" min="0" value={form.amount_estimate} onChange={(e) => setForm((previous) => ({ ...previous, amount_estimate: e.target.value }))} />
        </FieldShell>

        <FieldShell label="Probability (%)" help="Your estimated chance of winning the opportunity. Stage defaults can be overridden.">
          <input className="app-input" type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((previous) => ({ ...previous, probability: e.target.value }))} />
        </FieldShell>

        <FieldShell label="Source" help="Where this deal came from, such as referral, repeat customer, walk-in, website, or outbound sales.">
          <input className="app-input" placeholder="Referral, walk-in, website, repeat customer..." value={form.source} onChange={(e) => setForm((previous) => ({ ...previous, source: e.target.value }))} />
        </FieldShell>

        <FieldShell label="Next Step" help="The very next action needed to move the deal forward.">
          <input className="app-input" placeholder="Send quote, confirm artwork, schedule site visit..." value={form.next_step} onChange={(e) => setForm((previous) => ({ ...previous, next_step: e.target.value }))} />
        </FieldShell>

        <div className="md:col-span-2 rounded-2xl border border-dashed border-[var(--bedrock-border)] p-3">
          <button type="button" className="app-button-secondary w-full justify-center">
            <TrendingUp className="h-4 w-4" /> Quick-create primary contact (TODO backend enrichment)
          </button>
          <p className="mt-2 text-xs text-muted">Create a primary buyer or family contact without leaving the opportunity workflow.</p>
        </div>
      </div>
    </EntityCreateDrawer>
  );
}

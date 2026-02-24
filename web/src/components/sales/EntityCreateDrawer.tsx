import { ReactNode, useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  steps: string[];
  step: number;
  onStepChange: (step: number) => void;
  loading?: boolean;
  dirty?: boolean;
  error?: string;
  insights: ReactNode;
  onClose: () => void;
  onSaveDraft: () => void;
  onSaveNew: () => void;
  onCreate: () => void;
  creating?: boolean;
  disableCreate?: boolean;
  children: ReactNode;
};

export default function EntityCreateDrawer({ open, title, description, icon, steps, step, onStepChange, loading, dirty, error, insights, onClose, onSaveDraft, onSaveNew, onCreate, creating, disableCreate, children }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      const preferred = drawerRef.current?.querySelector<HTMLElement>("[data-autofocus='true']");
      preferred?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dirty && !window.confirm("Unsaved changes will be lost. Close this create flow?")) return;
        onClose();
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dirty, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50" onClick={onClose}>
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} className="absolute right-0 top-0 h-full w-full max-w-[1100px] border-l border-[var(--bedrock-border)] bg-[var(--bedrock-bg)]" onClick={(e) => e.stopPropagation()}>
        <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-[var(--bedrock-border)] px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3"><span className="rounded-lg border border-[var(--bedrock-border)] p-2">{icon}</span><div><h3 className="text-xl font-semibold">{title}</h3><p className="text-sm text-muted">{description}</p></div></div>
                <button className="app-button-ghost" onClick={onClose}><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {steps.map((label, idx) => <button key={label} className={`rounded-full border px-3 py-1 ${idx === step ? "border-primary text-primary" : "border-[var(--bedrock-border)] text-muted"}`} onClick={() => onStepChange(idx)}>{idx + 1}. {label}</button>)}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300"><AlertTriangle className="h-4 w-4" />{error}</div>}
              {loading ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="app-skeleton h-10 rounded-lg" />)}</div> : children}
            </div>
            <div className="sticky bottom-0 border-t border-[var(--bedrock-border)] bg-[var(--bedrock-bg)] px-6 py-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="app-button-secondary" onClick={onClose}>Cancel</button>
                <button className="app-button-secondary" onClick={onSaveDraft}>Save Draft</button>
                <button className="app-button-secondary" disabled={creating} onClick={onSaveNew}>Save & New</button>
                <button className="app-button" disabled={creating || disableCreate} onClick={onCreate}>{creating ? "Creating..." : "Create"}</button>
              </div>
            </div>
          </div>
          <div className="hidden overflow-y-auto border-l border-[var(--bedrock-border)] bg-surface p-4 lg:block">{insights}</div>
        </div>
      </aside>
    </div>
  );
}

import { ReactNode, useEffect, useMemo } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useBeforeUnload } from "react-router-dom";

type Step = { id: string; label: string };

type Props = {
  title: string;
  description: string;
  steps?: Step[];
  activeStepId?: string;
  onStepChange?: (stepId: string) => void;
  dirty?: boolean;
  error?: string;
  validationErrors?: { id: string; label: string }[];
  creating?: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  onSaveNew: () => void;
  onCreate: () => void;
  children: ReactNode;
  insights: ReactNode;
};

export default function CreateObjectPageShell({
  title,
  description,
  steps,
  activeStepId,
  onStepChange,
  dirty,
  error,
  validationErrors = [],
  creating,
  onClose,
  onCancel,
  onSaveDraft,
  onSaveNew,
  onCreate,
  children,
  insights,
}: Props) {
  const validationCount = validationErrors.length;
  const summary = useMemo(() => (validationCount ? `${validationCount} field${validationCount === 1 ? "" : "s"} missing` : "All required fields complete"), [validationCount]);

  useBeforeUnload((event) => {
    if (!dirty) return;
    event.preventDefault();
  });

  useEffect(() => {
    if (!dirty) return;
    const block = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);

  const guardedAction = (action: () => void) => {
    if (!dirty || window.confirm("You have unsaved changes. Continue?")) action();
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-[1600px] flex-col px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[var(--bedrock-border)] bg-[var(--bedrock-bg)]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <button type="button" aria-label="Close create page" className="app-button-ghost" onClick={() => guardedAction(onClose)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {!!steps?.length && (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Create sections">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => onStepChange?.(step.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${activeStepId === step.id ? "border-primary bg-primary/10 text-primary" : "border-[var(--bedrock-border)] text-muted hover:text-foreground"}`}
              >
                {index + 1}. {step.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300"><AlertTriangle className="h-4 w-4" />{error}</div>}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <main className="space-y-6 lg:col-span-8">{children}</main>
        <aside className="space-y-4 lg:col-span-4">{insights}</aside>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--bedrock-border)] bg-[var(--bedrock-bg)]/98 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className={`rounded-xl border px-3 py-2 text-sm ${validationCount ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
            <p className="font-medium">{summary}</p>
            {!!validationCount && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {validationErrors.slice(0, 3).map((item) => (
                  <li key={item.id}><a className="underline" href={`#${item.id}`}>{item.label}</a></li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="app-button-secondary" onClick={() => guardedAction(onCancel)}>Cancel</button>
            <button type="button" className="app-button-secondary" onClick={onSaveDraft}>Save Draft</button>
            <button type="button" className="app-button-secondary" disabled={creating} onClick={onSaveNew}>Save & New</button>
            <button type="button" className="app-button" disabled={creating || validationCount > 0} onClick={onCreate}>{creating ? "Creating..." : "Create"}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

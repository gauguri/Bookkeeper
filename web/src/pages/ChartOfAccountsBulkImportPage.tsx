import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, FileUp, ShieldCheck, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type ImportMode = "CREATE_ONLY" | "UPDATE_EXISTING" | "UPSERT";

type ImportFieldSpec = {
  field: string;
  label: string;
  required: boolean;
  description: string;
  accepted_values: string[];
  example?: string | null;
};

type ImportFormatResponse = {
  delimiter: string;
  has_header: boolean;
  required_fields: string[];
  optional_fields: string[];
  fields: ImportFieldSpec[];
  sample_csv: string;
  notes: string[];
};

type ImportSummary = {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  create_count: number;
  update_count: number;
  skip_count: number;
};

type ImportRowResult = {
  row_number: number;
  code?: string | null;
  name?: string | null;
  account_type?: string | null;
  parent_code?: string | null;
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  status: "VALID" | "ERROR";
  messages: string[];
};

type ImportAccountResult = {
  id: number;
  code: string;
  name: string;
  action: "CREATED" | "UPDATED";
  parent_account_id?: number | null;
};

type ImportResponse = {
  summary: ImportSummary;
  rows: ImportRowResult[];
  imported_accounts: ImportAccountResult[];
};

const importModeOptions: Array<{ value: ImportMode; label: string; description: string }> = [
  { value: "UPSERT", label: "Upsert", description: "Create new codes and update existing ones in one controlled load." },
  { value: "CREATE_ONLY", label: "Create only", description: "Reject any row whose account code already exists." },
  { value: "UPDATE_EXISTING", label: "Update only", description: "Only update existing codes and reject new ones." }
];

function statusTone(status: "VALID" | "ERROR") {
  return status === "VALID"
    ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
    : "border-rose-300/40 bg-rose-500/10 text-rose-700";
}

export default function ChartOfAccountsBulkImportPage() {
  const navigate = useNavigate();
  const [csvData, setCsvData] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [conflictStrategy, setConflictStrategy] = useState<ImportMode>("UPSERT");
  const [loadingFormat, setLoadingFormat] = useState(true);
  const [format, setFormat] = useState<ImportFormatResponse | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiFetch<ImportFormatResponse>("/chart-of-accounts/import-format")
      .then((response) => {
        setFormat(response);
        setCsvData(response.sample_csv);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingFormat(false));
  }, []);

  const selectedMode = useMemo(
    () => importModeOptions.find((option) => option.value === conflictStrategy) ?? importModeOptions[0],
    [conflictStrategy]
  );

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvData(text);
    setPreview(null);
    setSuccess("");
    setError("");
  };

  const downloadTemplate = () => {
    if (!format) return;
    const blob = new Blob([format.sample_csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "chart-of-accounts-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const runPreview = async () => {
    if (!csvData.trim()) {
      setError("CSV data is required before validation.");
      return;
    }

    setRunningPreview(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<ImportResponse>("/chart-of-accounts/import-preview", {
        method: "POST",
        body: JSON.stringify({
          csv_data: csvData,
          has_header: hasHeader,
          conflict_strategy: conflictStrategy
        })
      });
      setPreview(response);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningPreview(false);
    }
  };

  const executeImport = async () => {
    if (!preview) {
      setError("Run validation before importing.");
      return;
    }
    if (preview.summary.error_rows > 0) {
      setError("Resolve all validation errors before importing.");
      return;
    }

    setImporting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<ImportResponse>("/chart-of-accounts/import", {
        method: "POST",
        body: JSON.stringify({
          csv_data: csvData,
          has_header: hasHeader,
          conflict_strategy: conflictStrategy
        })
      });
      setPreview(response);
      setSuccess(`Import completed: ${response.summary.create_count} created, ${response.summary.update_count} updated.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const previewRows = preview?.rows ?? [];
  const importedAccounts = preview?.imported_accounts ?? [];

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" onClick={() => navigate("/accounts")} type="button">
            <ArrowLeft className="h-4 w-4" /> Back to Chart of Accounts
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting Import Workbench</p>
          <h1 className="text-3xl font-semibold">Chart of Accounts Import</h1>
          <p className="max-w-4xl text-muted">
            Validate, stage, and load account master data with explicit field mapping, hierarchy checks, and conflict handling.
            This workbench is designed for ERP-style cutovers and controlled chart maintenance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={downloadTemplate} type="button" disabled={!format || loadingFormat}>
            <Download className="h-4 w-4" /> Download template
          </button>
          <button className="app-button-secondary" onClick={runPreview} type="button" disabled={runningPreview || loadingFormat}>
            <ShieldCheck className="h-4 w-4" /> {runningPreview ? "Validating..." : "Validate CSV"}
          </button>
          <button className="app-button" onClick={executeImport} type="button" disabled={importing || !preview || preview.summary.error_rows > 0}>
            <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import accounts"}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <div className="app-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Source CSV</h2>
                <p className="text-sm text-muted">Upload a template file or paste CSV directly. The workbench supports header-driven imports and legacy no-header layouts.</p>
              </div>
              <label className="app-button-secondary cursor-pointer">
                <FileSpreadsheet className="h-4 w-4" /> Upload CSV
                <input accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} type="file" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground">Conflict strategy</span>
                <select className="app-input" value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value as ImportMode)}>
                  {importModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span>{selectedMode.description}</span>
              </label>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
                <p className="font-medium text-foreground">File interpretation</p>
                <label className="mt-3 inline-flex items-center gap-2">
                  <input checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} type="checkbox" />
                  CSV includes a header row
                </label>
                <p className="mt-3 text-xs">
                  Recommended format: header row with canonical fields `code,name,type,subtype,description,parent_code,is_active`.
                </p>
              </div>
            </div>

            <textarea
              className="app-input min-h-[340px] font-mono text-xs leading-6"
              value={csvData}
              onChange={(event) => {
                setCsvData(event.target.value);
                setPreview(null);
                setSuccess("");
              }}
              placeholder="Paste CSV here"
            />
          </div>

          {preview ? (
            <div className="app-card space-y-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Validation results</h2>
                  <p className="text-sm text-muted">Review row outcomes before loading into the ledger master data.</p>
                </div>
                <span className={`app-badge ${preview.summary.error_rows === 0 ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700" : "border-amber-300/40 bg-amber-500/10 text-amber-700"}`}>
                  {preview.summary.error_rows === 0 ? "Ready to import" : `${preview.summary.error_rows} row(s) need attention`}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-5">
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Rows</p>
                  <p className="mt-2 text-2xl font-semibold">{preview.summary.total_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Valid</p>
                  <p className="mt-2 text-2xl font-semibold">{preview.summary.valid_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Creates</p>
                  <p className="mt-2 text-2xl font-semibold">{preview.summary.create_count}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Updates</p>
                  <p className="mt-2 text-2xl font-semibold">{preview.summary.update_count}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Errors</p>
                  <p className="mt-2 text-2xl font-semibold">{preview.summary.error_rows}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-3 py-3">Row</th>
                      <th className="px-3 py-3">Code</th>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Parent</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={`${row.row_number}-${row.code || row.name || "row"}`} className="border-t border-border/70 align-top">
                        <td className="px-3 py-3 font-mono text-xs text-muted">{row.row_number}</td>
                        <td className="px-3 py-3 font-mono text-xs">{row.code || "-"}</td>
                        <td className="px-3 py-3">{row.name || "-"}</td>
                        <td className="px-3 py-3">{row.account_type || "-"}</td>
                        <td className="px-3 py-3 font-mono text-xs">{row.parent_code || "-"}</td>
                        <td className="px-3 py-3">{row.action}</td>
                        <td className="px-3 py-3"><span className={`app-badge ${statusTone(row.status)}`}>{row.status}</span></td>
                        <td className="px-3 py-3 text-xs text-muted">{row.messages.length ? row.messages.join(" ") : "No issues detected."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importedAccounts.length > 0 ? (
                <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-medium">Imported accounts</p>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {importedAccounts.map((account) => (
                      <div key={`${account.action}-${account.id}`} className="rounded-xl border border-emerald-300/40 bg-white/70 px-3 py-2 text-sm text-emerald-900">
                        <span className="font-mono text-xs text-emerald-700">{account.code}</span>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">{account.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="app-card space-y-4 p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">CSV format</h2>
            </div>
            {loadingFormat ? <p className="text-sm text-muted">Loading import contract...</p> : null}
            {format ? (
              <>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
                  <p><span className="font-medium text-foreground">Required fields:</span> {format.required_fields.join(", ")}</p>
                  <p className="mt-2"><span className="font-medium text-foreground">Optional fields:</span> {format.optional_fields.join(", ")}</p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                      <tr>
                        <th className="px-3 py-3">Field</th>
                        <th className="px-3 py-3">Req.</th>
                        <th className="px-3 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {format.fields.map((field) => (
                        <tr key={field.field} className="border-t border-border/70 align-top">
                          <td className="px-3 py-3 font-mono text-xs">{field.field}</td>
                          <td className="px-3 py-3">{field.required ? "Yes" : "No"}</td>
                          <td className="px-3 py-3 text-xs text-muted">
                            <p>{field.description}</p>
                            {field.accepted_values.length ? <p className="mt-1">Accepted: {field.accepted_values.join(", ")}</p> : null}
                            {field.example ? <p className="mt-1">Example: {field.example}</p> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4">
                  <p className="text-sm font-medium text-foreground">Sample template</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-background p-3 font-mono text-[11px] text-muted">{format.sample_csv}</pre>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
                  <div className="flex items-center gap-2 text-foreground">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="font-medium">Import controls</p>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {format.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

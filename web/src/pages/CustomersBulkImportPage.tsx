import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type ImportMode = "CREATE_ONLY" | "UPDATE_EXISTING" | "UPSERT";

type CustomerImportFieldSpec = {
  field: string;
  label: string;
  required: boolean;
  description: string;
  accepted_values: string[];
  example?: string | null;
};

type CustomerImportFormatResponse = {
  delimiter: string;
  has_header: boolean;
  required_fields: string[];
  optional_fields: string[];
  fields: CustomerImportFieldSpec[];
  sample_csv: string;
  notes: string[];
};

type CustomerImportSummary = {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  create_count: number;
  update_count: number;
  skip_count: number;
};

type CustomerImportRowResult = {
  row_number: number;
  name?: string | null;
  email?: string | null;
  is_active?: boolean | null;
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  status: "VALID" | "ERROR";
  messages: string[];
};

type CustomerImportRecord = {
  id: number;
  name: string;
  action: "CREATED" | "UPDATED";
};

type CustomerImportResponse = {
  summary: CustomerImportSummary;
  rows: CustomerImportRowResult[];
  imported_customers: CustomerImportRecord[];
};

const importModeOptions: Array<{ value: ImportMode; label: string; description: string }> = [
  { value: "UPSERT", label: "Upsert", description: "Create new customer names and update existing names in one controlled run." },
  { value: "CREATE_ONLY", label: "Create only", description: "Reject rows where customer name already exists." },
  { value: "UPDATE_EXISTING", label: "Update only", description: "Update existing customer names and reject new names." },
];

function statusTone(status: "VALID" | "ERROR") {
  return status === "VALID"
    ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
    : "border-rose-300/40 bg-rose-500/10 text-rose-700";
}

function activeLabel(isActive?: boolean | null) {
  if (isActive === false) return "Archived";
  return "Active";
}

export default function CustomersBulkImportPage() {
  const navigate = useNavigate();
  const [csvData, setCsvData] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [conflictStrategy, setConflictStrategy] = useState<ImportMode>("UPSERT");
  const [loadingFormat, setLoadingFormat] = useState(true);
  const [format, setFormat] = useState<CustomerImportFormatResponse | null>(null);
  const [preview, setPreview] = useState<CustomerImportResponse | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiFetch<CustomerImportFormatResponse>("/customers/import-format")
      .then((response) => {
        setFormat(response);
        setCsvData(response.sample_csv);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingFormat(false));
  }, []);

  const selectedMode = useMemo(
    () => importModeOptions.find((option) => option.value === conflictStrategy) ?? importModeOptions[0],
    [conflictStrategy],
  );
  const csvLineCount = useMemo(() => csvData.split(/\r?\n/).filter((line) => line.trim().length > 0).length, [csvData]);
  const estimatedRows = hasHeader ? Math.max(csvLineCount - 1, 0) : csvLineCount;
  const fieldCount = format ? format.required_fields.length + format.optional_fields.length : 0;

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
    link.download = "customers-import-template.csv";
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
      const response = await apiFetch<CustomerImportResponse>("/customers/import-preview", {
        method: "POST",
        body: JSON.stringify({
          csv_data: csvData,
          has_header: hasHeader,
          conflict_strategy: conflictStrategy,
        }),
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
      const response = await apiFetch<CustomerImportResponse>("/customers/import", {
        method: "POST",
        body: JSON.stringify({
          csv_data: csvData,
          has_header: hasHeader,
          conflict_strategy: conflictStrategy,
        }),
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
  const importedCustomers = preview?.imported_customers ?? [];

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" onClick={() => navigate("/sales/customers")} type="button">
            <ArrowLeft className="h-4 w-4" /> Back to Customer Ledger
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Customer Import Workbench</p>
          <h1 className="text-3xl font-semibold">Customers Bulk Import</h1>
          <p className="max-w-4xl text-muted">
            Validate, stage, and load customer master data with required-field enforcement, conflict handling, and row-level diagnostics.
            The import contract mirrors the customer master fields used by the ledger and profile views.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={downloadTemplate} type="button" disabled={!format || loadingFormat}>
            <Download className="h-4 w-4" /> Download template
          </button>
          <button className="app-button-secondary" onClick={runPreview} type="button" disabled={runningPreview}>
            <ShieldCheck className="h-4 w-4" /> {runningPreview ? "Validating..." : "Validate CSV"}
          </button>
          <button className="app-button" onClick={executeImport} type="button" disabled={importing || runningPreview}>
            <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import customers"}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">CSV rows staged</p>
          <p className="mt-1 text-2xl font-semibold">{estimatedRows}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Required fields</p>
          <p className="mt-1 text-2xl font-semibold">{format?.required_fields.length ?? 0}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Total mapped fields</p>
          <p className="mt-1 text-2xl font-semibold">{fieldCount}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Conflict strategy</p>
          <p className="mt-1 text-2xl font-semibold">{selectedMode.label}</p>
        </div>
      </div>

      <div className="app-card space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Source CSV</h2>
            <p className="text-sm text-muted">Upload a customer template file or paste CSV directly for validation.</p>
          </div>
          <label className="app-button-secondary cursor-pointer">
            <FileSpreadsheet className="h-4 w-4" /> Upload CSV
            <input accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} type="file" />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
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
              Recommended format: header row with canonical customer fields and explicit active defaults.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">Run sequence</p>
            <p className="mt-3 text-xs">1. Validate CSV for row-level issues.</p>
            <p className="mt-2 text-xs">2. Import customers after errors are resolved.</p>
            <p className="mt-2 text-xs">3. Review created and updated customer records.</p>
          </div>
        </div>

        <textarea
          className="app-input min-h-[320px] font-mono text-xs leading-6"
          value={csvData}
          onChange={(event) => {
            setCsvData(event.target.value);
            setPreview(null);
            setSuccess("");
          }}
          placeholder="Paste customer CSV here"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="app-card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Import contract</h2>
          </div>
          {loadingFormat ? <p className="text-sm text-muted">Loading import contract...</p> : null}
          {format ? (
            <>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
                <p><span className="font-medium text-foreground">Required fields:</span> {format.required_fields.join(", ")}</p>
                <p className="mt-2"><span className="font-medium text-foreground">Optional fields:</span> {format.optional_fields.join(", ")}</p>
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

        <div className="app-card space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Sample template</h2>
            <button className="app-button-secondary" onClick={downloadTemplate} type="button" disabled={!format || loadingFormat}>
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
          <p className="text-sm text-muted">Use this canonical CSV layout to align with the customer master fields.</p>
          <pre className="min-h-[236px] overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-muted">
            {format?.sample_csv || ""}
          </pre>
        </div>
      </div>

      <div className="app-card space-y-4 p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">CSV format reference</h2>
        </div>
        {loadingFormat ? <p className="text-sm text-muted">Loading import contract...</p> : null}
        {format ? (
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
        ) : null}
      </div>

      {preview ? (
        <div className="app-card space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Validation results</h2>
              <p className="text-sm text-muted">Review row outcomes before loading customer master data.</p>
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
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Validation</th>
                  <th className="px-3 py-3">Messages</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.row_number}-${row.name || "row"}`} className="border-t border-border/70 align-top">
                    <td className="px-3 py-3 font-mono text-xs text-muted">{row.row_number}</td>
                    <td className="px-3 py-3">{row.name || "-"}</td>
                    <td className="px-3 py-3">{row.email || "-"}</td>
                    <td className="px-3 py-3">{activeLabel(row.is_active)}</td>
                    <td className="px-3 py-3">{row.action}</td>
                    <td className="px-3 py-3"><span className={`app-badge ${statusTone(row.status)}`}>{row.status}</span></td>
                    <td className="px-3 py-3 text-xs text-muted">{row.messages.length ? row.messages.join(" ") : "No issues detected."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importedCustomers.length > 0 ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-sm font-medium">Imported customers</p>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {importedCustomers.map((customer) => (
                  <div key={`${customer.action}-${customer.id}`} className="rounded-xl border border-emerald-300/40 bg-white/70 px-3 py-2 text-sm text-emerald-900">
                    <span className="font-mono text-xs text-emerald-700">#{customer.id}</span>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">{customer.action}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

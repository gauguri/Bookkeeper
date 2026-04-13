import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type SalesImportFieldSpec = {
  field: string;
  label: string;
  required: boolean;
  description: string;
  example?: string | null;
};

type SalesImportFormatResponse = {
  delimiter: string;
  has_header: boolean;
  sales_required_fields: string[];
  sales_optional_fields: string[];
  sales_fields: SalesImportFieldSpec[];
  line_required_fields: string[];
  line_optional_fields: string[];
  line_fields: SalesImportFieldSpec[];
  sales_sample_csv: string;
  line_sample_csv: string;
  notes: string[];
};

type SalesImportSummary = {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  create_count: number;
  update_count: number;
  skip_count: number;
  sales_rows: number;
  line_rows: number;
};

type SalesImportRowResult = {
  source: "SALES" | "LINE";
  row_number: number;
  sales_order_number?: string | null;
  invoice_number?: string | null;
  customer_number?: string | null;
  item_code?: string | null;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  status: "VALID" | "ERROR";
  messages: string[];
};

type SalesImportRecord = {
  id: number;
  invoice_number: string;
  customer_name: string;
  line_count: number;
  action: "CREATED";
};

type SalesImportResponse = {
  summary: SalesImportSummary;
  rows: SalesImportRowResult[];
  imported_invoices: SalesImportRecord[];
};

function badgeTone(errorRows: number) {
  return errorRows === 0
    ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
    : "border-amber-300/40 bg-amber-500/10 text-amber-700";
}

export default function InvoicesBulkImportPage() {
  const navigate = useNavigate();
  const [salesCsv, setSalesCsv] = useState("");
  const [salesInventoryCsv, setSalesInventoryCsv] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [format, setFormat] = useState<SalesImportFormatResponse | null>(null);
  const [loadingFormat, setLoadingFormat] = useState(true);
  const [preview, setPreview] = useState<SalesImportResponse | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiFetch<SalesImportFormatResponse>("/invoices/import-format")
      .then((response) => {
        setFormat(response);
        setSalesCsv(response.sales_sample_csv);
        setSalesInventoryCsv(response.line_sample_csv);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingFormat(false));
  }, []);

  const estimatedSalesRows = useMemo(() => {
    const lineCount = salesCsv.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return hasHeader ? Math.max(lineCount - 1, 0) : lineCount;
  }, [salesCsv, hasHeader]);

  const estimatedLineRows = useMemo(() => {
    const lineCount = salesInventoryCsv.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return hasHeader ? Math.max(lineCount - 1, 0) : lineCount;
  }, [salesInventoryCsv, hasHeader]);

  const downloadTemplate = () => {
    if (!format) return;
    const files = [
      { name: "sales-template.csv", content: format.sales_sample_csv },
      { name: "sales-inventory-template.csv", content: format.line_sample_csv },
    ];
    files.forEach((file) => {
      const blob = new Blob([file.content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    let nextSalesCsv = salesCsv;
    let nextLineCsv = salesInventoryCsv;
    for (const file of files) {
      const text = await file.text();
      if (file.name.toLowerCase().includes("inventory")) {
        nextLineCsv = text;
      } else {
        nextSalesCsv = text;
      }
    }
    setSalesCsv(nextSalesCsv);
    setSalesInventoryCsv(nextLineCsv);
    setPreview(null);
    setSuccess("");
    setError("");
    event.target.value = "";
  };

  const runPreview = async () => {
    if (!salesCsv.trim() || !salesInventoryCsv.trim()) {
      setError("Both Sales2 and Sales-Inventory CSV data are required before validation.");
      return;
    }
    setRunningPreview(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<SalesImportResponse>("/invoices/import-preview", {
        method: "POST",
        body: JSON.stringify({
          sales_csv: salesCsv,
          sales_inventory_csv: salesInventoryCsv,
          has_header: hasHeader,
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
      setError("Run validation before importing sales.");
      return;
    }
    if (preview.summary.error_rows > 0) {
      setError("Resolve all validation errors before importing sales.");
      return;
    }
    setImporting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<SalesImportResponse>("/invoices/import", {
        method: "POST",
        body: JSON.stringify({
          sales_csv: salesCsv,
          sales_inventory_csv: salesInventoryCsv,
          has_header: hasHeader,
        }),
      });
      setPreview(response);
      setSuccess(`Import completed: ${response.summary.create_count} invoices created.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const errorRows = (preview?.rows ?? []).filter((row) => row.status === "ERROR");

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-2">
        <button className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" onClick={() => navigate("/invoices")} type="button">
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Sales Import Workbench</p>
        <h1 className="text-3xl font-semibold">Sales Bulk Import</h1>
        <p className="max-w-4xl text-muted">
          Validate, stage, and load Glenrock sales history using the sales header CSV plus the Sales-Inventory detail CSV in tandem.
          Phase 1 creates invoices and invoice lines only for already-matched customers and items.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sales Rows</p>
          <p className="mt-1 text-2xl font-semibold">{estimatedSalesRows}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Line Rows</p>
          <p className="mt-1 text-2xl font-semibold">{estimatedLineRows}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Customer Key</p>
          <p className="mt-1 text-2xl font-semibold">Customer Number</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Item Key</p>
          <p className="mt-1 text-2xl font-semibold">Item Code</p>
        </div>
      </div>

      <div className="app-card space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Source CSVs</h2>
            <p className="text-sm text-muted">Upload both Glenrock CSVs or paste them directly for validation.</p>
          </div>
          <div className="relative z-10 flex flex-nowrap items-center gap-2 overflow-x-auto">
            <button className="app-button-secondary whitespace-nowrap" onClick={downloadTemplate} type="button" disabled={!format || loadingFormat}>
              <Download className="h-4 w-4" /> Download Template
            </button>
            <label className="app-button-secondary cursor-pointer whitespace-nowrap">
              <FileSpreadsheet className="h-4 w-4" /> Upload CSV
              <input accept=".csv,text/csv" className="hidden" multiple onChange={handleFileUpload} type="file" />
            </label>
            <button className="app-button-secondary whitespace-nowrap" onClick={runPreview} type="button" disabled={runningPreview}>
              <ShieldCheck className="h-4 w-4" /> {runningPreview ? "Validating..." : "Validate CSV"}
            </button>
            <button className="app-button whitespace-nowrap" onClick={executeImport} type="button" disabled={importing || runningPreview}>
              <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import Sales"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">Import scope</p>
            <p className="mt-3 text-xs">Phase 1 creates invoices and invoice lines only. It does not create payments or post inventory movements.</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">Upload behavior</p>
            <p className="mt-3 text-xs">The Upload button accepts both CSVs. Files with “Inventory” in the name are loaded into the line importer automatically.</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">File interpretation</p>
            <label className="mt-3 inline-flex items-center gap-2">
              <input checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} type="checkbox" />
              CSVs include header rows
            </label>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground">Sales2.csv</span>
            <textarea className="app-input min-h-[260px] font-mono text-xs leading-6" value={salesCsv} onChange={(event) => { setSalesCsv(event.target.value); setPreview(null); setSuccess(""); }} placeholder="Paste Sales2.csv here" />
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground">Sales-Inventory2.csv</span>
            <textarea className="app-input min-h-[260px] font-mono text-xs leading-6" value={salesInventoryCsv} onChange={(event) => { setSalesInventoryCsv(event.target.value); setPreview(null); setSuccess(""); }} placeholder="Paste Sales-Inventory2.csv here" />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="app-card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Import Contract</h2>
          </div>
          {loadingFormat ? (
            <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
          ) : format ? (
            <>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Sales Header Fields</p>
                <div className="mt-3 space-y-3">
                  {format.sales_fields.map((field) => (
                    <div key={field.field} className="rounded-xl border border-border/70 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{field.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${field.required ? "bg-primary/10 text-primary" : "bg-secondary text-muted"}`}>
                          {field.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{field.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Sales Line Fields</p>
                <div className="mt-3 space-y-3">
                  {format.line_fields.map((field) => (
                    <div key={field.field} className="rounded-xl border border-border/70 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{field.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${field.required ? "bg-primary/10 text-primary" : "bg-secondary text-muted"}`}>
                          {field.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{field.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="app-card space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Validation Results</h2>
              <p className="text-sm text-muted">Review sales headers and lines before loading invoices.</p>
            </div>
            {preview ? (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeTone(preview.summary.error_rows)}`}>
                {preview.summary.error_rows === 0 ? "Ready to import" : `${preview.summary.error_rows} row(s) need attention`}
              </span>
            ) : null}
          </div>

          {!preview ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
              Upload both sales CSVs, then run validation to preview invoices before import.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Rows</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.total_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sales Rows</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.sales_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Line Rows</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.line_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Valid</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.valid_rows}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Creates</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.create_count}</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Errors</p>
                  <p className="mt-1 text-2xl font-semibold">{preview.summary.error_rows}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="grid grid-cols-[0.8fr_0.7fr_0.9fr_0.9fr_0.8fr_2fr] gap-3 bg-secondary/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>Source</span>
                  <span>Row</span>
                  <span>Order</span>
                  <span>Invoice</span>
                  <span>Key</span>
                  <span>Issue</span>
                </div>
                {(errorRows.length ? errorRows : preview.rows).map((row) => (
                  <div key={`${row.source}-${row.row_number}-${row.sales_order_number ?? row.item_code ?? ""}`} className="grid grid-cols-[0.8fr_0.7fr_0.9fr_0.9fr_0.8fr_2fr] gap-3 border-t border-border px-4 py-3 text-sm">
                    <span className="font-medium">{row.source === "SALES" ? "Sales" : "Sales Line"}</span>
                    <span>{row.row_number}</span>
                    <span>{row.sales_order_number || "—"}</span>
                    <span>{row.invoice_number || "—"}</span>
                    <span>{row.customer_number || row.item_code || "—"}</span>
                    <span className={row.status === "ERROR" ? "text-danger" : "text-muted"}>{row.messages.join(" ")}</span>
                  </div>
                ))}
              </div>

              {preview.imported_invoices.length > 0 ? (
                <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/5 px-4 py-3">
                  <p className="font-medium text-emerald-700">Imported invoices</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {preview.imported_invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300/30 px-3 py-2">
                        <span className="font-medium">{invoice.invoice_number}</span>
                        <span className="text-muted">{invoice.customer_name}</span>
                        <span>{invoice.line_count} lines</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

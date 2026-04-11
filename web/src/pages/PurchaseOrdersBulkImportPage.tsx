import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

type PurchaseOrderImportFieldSpec = {
  field: string;
  label: string;
  required: boolean;
  description: string;
  example?: string | null;
};

type PurchaseOrderImportFormatResponse = {
  delimiter: string;
  has_header: boolean;
  purchase_order_required_fields: string[];
  purchase_order_optional_fields: string[];
  purchase_order_fields: PurchaseOrderImportFieldSpec[];
  inventory_required_fields: string[];
  inventory_optional_fields: string[];
  inventory_fields: PurchaseOrderImportFieldSpec[];
  purchase_order_sample_csv: string;
  inventory_sample_csv: string;
  notes: string[];
};

type PurchaseOrderImportSummary = {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  create_count: number;
  update_count: number;
  skip_count: number;
  purchase_order_rows: number;
  inventory_rows: number;
};

type PurchaseOrderImportRowResult = {
  source: "PURCHASE_ORDER" | "INVENTORY";
  row_number: number;
  po_number?: string | null;
  vendor_number?: string | null;
  item_code?: string | null;
  quantity?: string | number | null;
  unit_cost?: string | number | null;
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  status: "VALID" | "ERROR";
  messages: string[];
};

type PurchaseOrderImportRecord = {
  id: number;
  po_number: string;
  supplier_name: string;
  line_count: number;
  action: "CREATED" | "UPDATED";
};

type PurchaseOrderImportResponse = {
  summary: PurchaseOrderImportSummary;
  rows: PurchaseOrderImportRowResult[];
  imported_purchase_orders: PurchaseOrderImportRecord[];
};

function badgeTone(errorRows: number) {
  return errorRows === 0
    ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
    : "border-amber-300/40 bg-amber-500/10 text-amber-700";
}

export default function PurchaseOrdersBulkImportPage() {
  const navigate = useNavigate();
  const [purchaseOrdersCsv, setPurchaseOrdersCsv] = useState("");
  const [inventoryCsv, setInventoryCsv] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [format, setFormat] = useState<PurchaseOrderImportFormatResponse | null>(null);
  const [loadingFormat, setLoadingFormat] = useState(true);
  const [preview, setPreview] = useState<PurchaseOrderImportResponse | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiFetch<PurchaseOrderImportFormatResponse>("/purchase-orders/import-format")
      .then((response) => {
        setFormat(response);
        setPurchaseOrdersCsv(response.purchase_order_sample_csv);
        setInventoryCsv(response.inventory_sample_csv);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingFormat(false));
  }, []);

  const estimatedPurchaseOrderRows = useMemo(() => {
    const lineCount = purchaseOrdersCsv.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return hasHeader ? Math.max(lineCount - 1, 0) : lineCount;
  }, [purchaseOrdersCsv, hasHeader]);
  const estimatedInventoryRows = useMemo(() => {
    const lineCount = inventoryCsv.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return hasHeader ? Math.max(lineCount - 1, 0) : lineCount;
  }, [inventoryCsv, hasHeader]);

  const downloadTemplate = () => {
    if (!format) return;
    const files = [
      { name: "purchase-orders-template.csv", content: format.purchase_order_sample_csv },
      { name: "purchase-order-inventory-template.csv", content: format.inventory_sample_csv },
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

    let nextPurchaseOrdersCsv = purchaseOrdersCsv;
    let nextInventoryCsv = inventoryCsv;

    for (const file of files) {
      const text = await file.text();
      if (file.name.toLowerCase().includes("inventory")) {
        nextInventoryCsv = text;
      } else {
        nextPurchaseOrdersCsv = text;
      }
    }

    setPurchaseOrdersCsv(nextPurchaseOrdersCsv);
    setInventoryCsv(nextInventoryCsv);
    setPreview(null);
    setSuccess("");
    setError("");
    event.target.value = "";
  };

  const runPreview = async () => {
    if (!purchaseOrdersCsv.trim() || !inventoryCsv.trim()) {
      setError("Both PurchaseOrder2 and PurchaseOrder-Inventory CSV data are required before validation.");
      return;
    }

    setRunningPreview(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<PurchaseOrderImportResponse>("/purchase-orders/import-preview", {
        method: "POST",
        body: JSON.stringify({
          purchase_orders_csv: purchaseOrdersCsv,
          inventory_csv: inventoryCsv,
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
      setError("Run validation before importing purchase orders.");
      return;
    }
    if (preview.summary.error_rows > 0) {
      setError("Resolve all validation errors before importing purchase orders.");
      return;
    }

    setImporting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch<PurchaseOrderImportResponse>("/purchase-orders/import", {
        method: "POST",
        body: JSON.stringify({
          purchase_orders_csv: purchaseOrdersCsv,
          inventory_csv: inventoryCsv,
          has_header: hasHeader,
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

  const errorRows = (preview?.rows ?? []).filter((row) => row.status === "ERROR");

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-2">
        <button className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" onClick={() => navigate("/purchasing/po-hub")} type="button">
          <ArrowLeft className="h-4 w-4" /> Back to Procurement Hub
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Procurement Import Workbench</p>
        <h1 className="text-3xl font-semibold">Purchase Orders Bulk Import</h1>
        <p className="max-w-4xl text-muted">
          Validate, stage, and load Glenrock purchase orders using the header CSV plus the PurchaseOrder-Inventory detail CSV in tandem.
          Vendor Number resolves suppliers, and Item Code resolves existing catalog items.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">PO Rows</p>
          <p className="mt-1 text-2xl font-semibold">{estimatedPurchaseOrderRows}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Inventory Rows</p>
          <p className="mt-1 text-2xl font-semibold">{estimatedInventoryRows}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Supplier Keys</p>
          <p className="mt-1 text-2xl font-semibold">Vendor Number</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Item Keys</p>
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
              <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import Purchase Orders"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">File interpretation</p>
            <label className="mt-3 inline-flex items-center gap-2">
              <input checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} type="checkbox" />
              CSVs include header rows
            </label>
            <p className="mt-3 text-xs">Recommended format: upload the two Glenrock CSV exports exactly as received.</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">Upload behavior</p>
            <p className="mt-3 text-xs">The single Upload button accepts both CSVs. Files with “Inventory” in the name are loaded into the detail importer automatically.</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">Run sequence</p>
            <p className="mt-3 text-xs">1. Upload both CSVs.</p>
            <p className="mt-2 text-xs">2. Validate supplier, PO, and item matching.</p>
            <p className="mt-2 text-xs">3. Import purchase orders once no errors remain.</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground">PurchaseOrder2.csv</span>
            <textarea
              className="app-input min-h-[260px] font-mono text-xs leading-6"
              value={purchaseOrdersCsv}
              onChange={(event) => {
                setPurchaseOrdersCsv(event.target.value);
                setPreview(null);
                setSuccess("");
              }}
              placeholder="Paste PurchaseOrder2.csv here"
            />
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground">PurchaseOrder-Inventory2.csv</span>
            <textarea
              className="app-input min-h-[260px] font-mono text-xs leading-6"
              value={inventoryCsv}
              onChange={(event) => {
                setInventoryCsv(event.target.value);
                setPreview(null);
                setSuccess("");
              }}
              placeholder="Paste PurchaseOrder-Inventory2.csv here"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="app-card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Import Contract</h2>
          </div>
          {loadingFormat ? <p className="text-sm text-muted">Loading import contract...</p> : null}
          {format ? (
            <>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
                <p><span className="font-medium text-foreground">PO required:</span> {format.purchase_order_required_fields.join(", ")}</p>
                <p className="mt-2"><span className="font-medium text-foreground">Inventory required:</span> {format.inventory_required_fields.join(", ")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
                <p className="font-medium text-foreground">Import controls</p>
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
            <h2 className="text-xl font-semibold">Sample Templates</h2>
            <button className="app-button-secondary" onClick={downloadTemplate} type="button" disabled={!format || loadingFormat}>
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
          <p className="text-sm text-muted">The template download includes one header CSV and one PO inventory CSV.</p>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium text-foreground">PurchaseOrder2.csv sample</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-muted">{format?.purchase_order_sample_csv || ""}</pre>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium text-foreground">PurchaseOrder-Inventory2.csv sample</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-muted">{format?.inventory_sample_csv || ""}</pre>
            </div>
          </div>
        </div>
      </div>

      {preview ? (
        <div className="app-card space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Validation Results</h2>
              <p className="text-sm text-muted">Review purchase orders and line items before loading procurement history.</p>
            </div>
            <span className={`app-badge ${badgeTone(preview.summary.error_rows)}`}>
              {preview.summary.error_rows === 0 ? "Ready to import" : `${preview.summary.error_rows} row(s) need attention`}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-6">
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Rows</p>
              <p className="mt-2 text-2xl font-semibold">{preview.summary.total_rows}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">PO Rows</p>
              <p className="mt-2 text-2xl font-semibold">{preview.summary.purchase_order_rows}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Line Rows</p>
              <p className="mt-2 text-2xl font-semibold">{preview.summary.inventory_rows}</p>
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

          {errorRows.length === 0 ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              All uploaded purchase-order rows validated successfully.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Row</th>
                    <th className="px-3 py-3">PO Number</th>
                    <th className="px-3 py-3">Vendor</th>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row) => (
                    <tr key={`${row.source}-${row.row_number}-${row.po_number ?? ""}-${row.item_code ?? ""}`} className="border-t border-border/70 align-top">
                      <td className="px-3 py-3 text-xs font-medium">{row.source === "PURCHASE_ORDER" ? "Purchase Order" : "Inventory Line"}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.row_number}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.po_number || "-"}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.vendor_number || "-"}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.item_code || "-"}</td>
                      <td className="px-3 py-3 text-xs text-danger">{row.messages.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.imported_purchase_orders.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Imported Purchase Orders</h3>
              <div className="mt-3 overflow-hidden rounded-2xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-background text-left text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-3 py-3">PO Number</th>
                      <th className="px-3 py-3">Supplier</th>
                      <th className="px-3 py-3">Lines</th>
                      <th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.imported_purchase_orders.map((record) => (
                      <tr key={record.id} className="border-t border-border/70">
                        <td className="px-3 py-3 font-mono text-xs">{record.po_number}</td>
                        <td className="px-3 py-3">{record.supplier_name}</td>
                        <td className="px-3 py-3">{record.line_count}</td>
                        <td className="px-3 py-3 text-xs">{record.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

import { useState } from "react";
import { Upload } from "lucide-react";
import { apiFetch } from "../api";

type BulkImportResponse = {
  created_count: number;
  accounts: Array<{ code: string; name: string; parent_account_id?: number | null }>;
};

export default function ChartOfAccountsBulkImportPage() {
  const [csvData, setCsvData] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const submitBulkImport = async () => {
    if (!csvData.trim()) {
      setError("CSV data is required for bulk import.");
      return;
    }

    setImporting(true);
    setError("");
    setResult("");
    try {
      const response = await apiFetch<BulkImportResponse>("/chart-of-accounts/bulk-import", {
        method: "POST",
        body: JSON.stringify({ csv_data: csvData })
      });
      setResult(`Imported ${response.created_count} account${response.created_count === 1 ? "" : "s"}.`);
      setCsvData("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting</p>
        <h1 className="text-3xl font-semibold">Chart of Accounts · Bulk Import</h1>
        <p className="text-muted">
          Paste CSV rows in this format: Code, Name of the Account, Type, SubType, Parent (or null).
        </p>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="app-card space-y-4 p-6">
        <label className="space-y-2 text-sm text-muted">
          <span className="font-medium text-foreground">CSV Data</span>
          <textarea
            className="app-input min-h-56"
            value={csvData}
            onChange={(event) => setCsvData(event.target.value)}
            placeholder={
              "1000,Cash,Asset,Cash,null\n1100,Operating Cash,Asset,Bank,1000\n2000,Accounts Payable,Liability,Current Liability,null"
            }
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">
            Type must be one of Asset, Liability, Equity, Income, Expense, COGS, or Other. Parent values must match an existing
            or imported account code.
          </span>
          <button className="app-button" type="button" onClick={submitBulkImport} disabled={importing}>
            <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import CSV"}
          </button>
        </div>
        {result && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{result}</div>}
      </div>
    </section>
  );
}

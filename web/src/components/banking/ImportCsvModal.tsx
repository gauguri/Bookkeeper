import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<void>;
};

function parseCsv(content: string): { rows: Record<string, string>[]; errors: string[] } {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["CSV must include a header and at least one row."] };
  const headers = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const required = ["date", "description"];
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}`] };
  const rows: Record<string, string>[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => { row[header] = (values[idx] || "").trim(); });
    if (!row.date || !row.description) errors.push(`Row ${i + 1}: date and description are required.`);
    rows.push(row);
  }
  return { rows, errors };
}

export default function ImportCsvModal({ open, onClose, onImport }: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const sample = useMemo(() => "date,description,amount,currency,vendor,reference\n2026-02-01,Stripe payout,4200.99,USD,Stripe,po-231\n2026-02-02,AWS charge,-813.22,USD,AWS,inv-2381\n", []);

  if (!open) return null;

  const downloadSample = () => {
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bank-statement-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-2xl border bg-surface p-6" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-semibold">Import statement CSV</h2>
        <p className="mt-1 text-sm text-muted">Manual import (CSV) supported. Accepted columns: date, description, amount OR debit/credit.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="app-button-secondary cursor-pointer">Choose CSV<input type="file" accept=".csv" className="hidden" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            const content = await file.text();
            const parsed = parseCsv(content);
            setRows(parsed.rows);
            setErrors(parsed.errors);
          }} /></label>
          <button className="app-button-ghost" onClick={downloadSample}>Download sample CSV</button>
        </div>
        {fileName ? <p className="mt-3 text-sm">Loaded: <strong>{fileName}</strong> ({rows.length} rows)</p> : null}
        {errors.length ? <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-danger">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button className="app-button-secondary" onClick={onClose}>Cancel</button>
          <button className="app-button" disabled={busy || !!errors.length || !rows.length} onClick={async () => {
            setBusy(true);
            await onImport(rows);
            setBusy(false);
            onClose();
          }}>{busy ? "Importing…" : "Import"}</button>
        </div>
      </div>
    </div>
  );
}

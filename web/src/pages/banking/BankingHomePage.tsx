import { useNavigate } from "react-router-dom";
import BankingCharts from "../../components/banking/BankingCharts";
import BankingKpis from "../../components/banking/BankingKpis";
import ImportCsvModal from "../../components/banking/ImportCsvModal";
import { useBankAccounts, useBankingDashboard, useImportCsv } from "../../hooks/useBanking";
import { useState } from "react";

export default function BankingHomePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useBankingDashboard();
  const { data: accounts } = useBankAccounts();
  const importCsv = useImportCsv();
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <section className="space-y-4">
      <header className="app-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-sm text-muted">Cash visibility and reconciliation</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button" onClick={() => setImportOpen(true)}>Connect account</button>
          <button className="app-button-secondary" onClick={() => setImportOpen(true)}>Import statement</button>
          <button className="app-button-secondary" onClick={() => navigate("/banking/reconciliation")}>New reconciliation</button>
        </div>
      </header>

      {message ? <p className="rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm">{message}</p> : null}
      <BankingKpis kpis={data?.kpis} loading={isLoading} />
      <BankingCharts
        loading={isLoading}
        trend={data?.cash_trend || []}
        categories={data?.category_breakdown || []}
        progress={data?.reconciliation_progress || []}
        onCategoryClick={(category) => navigate(`/banking/transactions?category=${encodeURIComponent(category)}`)}
      />

      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (rows) => {
          if (!accounts?.[0]) return;
          const result = await importCsv.mutateAsync({ bank_account_id: accounts[0].id, rows });
          setMessage(`Imported ${result.imported_count} rows${result.errors.length ? `, ${result.errors.length} with errors` : ""}.`);
        }}
      />
    </section>
  );
}

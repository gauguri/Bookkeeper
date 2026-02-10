import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "../api";

type SalesRequestApi = {
  id: number;
  customer_name?: string | null;
  customer?: { name?: string | null } | null;
  amount?: number | null;
  total?: number | null;
  status?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
  lines?: Array<{ qty_requested?: number | null }> | null;
};

type SalesRequestRow = {
  id: number;
  customer: string;
  amount: number;
  status: string;
  createdDate: string;
};

const mockSalesRequests: SalesRequestRow[] = [
  {
    id: 3201,
    customer: "Mercury Retail Group",
    amount: 1240,
    status: "Pending",
    createdDate: "2026-01-12"
  },
  {
    id: 3202,
    customer: "Northwind Studio",
    amount: 780,
    status: "Approved",
    createdDate: "2026-01-11"
  },
  {
    id: 3203,
    customer: "Horizon Foods",
    amount: 440,
    status: "In Review",
    createdDate: "2026-01-10"
  }
];

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString();
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const toSalesRequestRow = (request: SalesRequestApi): SalesRequestRow => {
  const derivedAmount = (request.lines ?? []).reduce((sum, line) => sum + Number(line.qty_requested ?? 0), 0);
  return {
    id: request.id,
    customer: request.customer_name ?? request.customer?.name ?? "Walk-in customer",
    amount: Number(request.amount ?? request.total ?? derivedAmount),
    status: request.status ?? "Draft",
    createdDate: request.requested_at ?? request.created_at ?? ""
  };
};

export default function SalesRequestsPage() {
  const [rows, setRows] = useState<SalesRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSalesRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      // TODO: Replace this list fetch with dedicated Sales Requests endpoint once contract is finalized.
      const response = await apiFetch<SalesRequestApi[]>("/sales-requests");
      const mappedRows = Array.isArray(response) ? response.map(toSalesRequestRow) : [];
      setRows(mappedRows);
    } catch (err) {
      const message = (err as Error).message;
      setError(message || "We could not load sales requests.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSalesRequests();
  }, [loadSalesRequests]);

  const hasRows = rows.length > 0;
  const displayRows = useMemo(() => (hasRows ? rows : mockSalesRequests), [hasRows, rows]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Sales Requests</h2>
        <p className="text-sm text-muted">Track incoming sales demand and fulfilment readiness.</p>
      </header>

      {isLoading ? (
        <section className="app-card flex items-center gap-3" role="status" aria-live="polite">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted">Loading sales requests…</p>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="app-card space-y-3" role="alert">
          <h3 className="text-lg font-semibold">We hit a snag loading Sales Requests</h3>
          <p className="text-sm text-muted">{error}</p>
          <button className="app-button-primary" onClick={loadSalesRequests}>
            Retry
          </button>
        </section>
      ) : null}

      {!isLoading && !error && !hasRows ? (
        <section className="app-card space-y-3">
          <h3 className="text-lg font-semibold">No sales requests yet</h3>
          <p className="text-sm text-muted">
            When new requests arrive, they will appear here. Mock records are shown below in the meantime.
          </p>
          <button className="app-button-primary" onClick={loadSalesRequests}>
            Refresh requests
          </button>
        </section>
      ) : null}

      {!isLoading && !error ? (
        <section className="app-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created Date</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((request) => (
                <tr key={request.id} className="border-b border-border/70 last:border-b-0">
                  <td className="px-4 py-3 font-medium">#{request.id}</td>
                  <td className="px-4 py-3">{request.customer}</td>
                  <td className="px-4 py-3">{formatCurrency(request.amount)}</td>
                  <td className="px-4 py-3">{request.status}</td>
                  <td className="px-4 py-3">{formatDate(request.createdDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

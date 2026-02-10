import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { apiFetch } from "../api";
import SalesRequestForm from "../components/SalesRequestForm";

type SalesRequestLine = {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type SalesRequest = {
  id: number;
  request_number: string;
  customer_name: string | null;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  created_at: string;
  requested_fulfillment_date: string | null;
  notes?: string | null;
  total_amount: number;
  lines: SalesRequestLine[];
};

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };

const statusStyles: Record<string, string> = {
  OPEN: "border-primary/30 bg-primary/10 text-primary",
  IN_PROGRESS: "border-warning/30 bg-warning/10 text-warning",
  CLOSED: "border-success/30 bg-success/10 text-success",
};

const formatDate = (value?: string | null) => {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString();
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function SalesRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<SalesRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDependencies = useCallback(async () => {
    const [customersData, itemsData] = await Promise.all([apiFetch<Customer[]>("/customers"), apiFetch<Item[]>("/items")]);
    setCustomers(customersData);
    setItems(itemsData);
  }, []);

  const loadSalesRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (customerFilter.trim()) params.set("customer", customerFilter.trim());
      const query = params.toString();
      const data = await apiFetch<SalesRequest[]>(`/sales-requests${query ? `?${query}` : ""}`);
      setRequests(data);
    } catch (err) {
      setError((err as Error).message || "Unable to load sales requests.");
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [customerFilter, statusFilter]);

  useEffect(() => {
    loadDependencies().catch(() => undefined);
  }, [loadDependencies]);

  useEffect(() => {
    loadSalesRequests();
  }, [loadSalesRequests]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Sales Requests</h2>
          <p className="text-sm text-muted">Internal rep-entered requests. No automatic external ingestion.</p>
        </div>
        <button
          className="app-button"
          onClick={() => {
            setFormKey((prev) => prev + 1);
            setShowCreate((prev) => !prev);
          }}
        >
          <Plus className="h-4 w-4" /> New Sales Request
        </button>
      </header>

      {notice ? <section className="app-card text-sm text-success p-4">{notice}</section> : null}

      {showCreate ? (
        <SalesRequestForm
          key={formKey}
          customers={customers}
          items={items}
          createdByUserId={1}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            await loadSalesRequests();
            setShowCreate(false);
            setNotice("Sales Request created successfully.");
            setTimeout(() => setNotice(""), 5000);
          }}
        />
      ) : null}

      <section className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className="app-input w-48" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="CLOSED">Closed</option>
          </select>
          <input
            className="app-input w-72"
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            placeholder="Filter by customer"
          />
          <button className="app-button-secondary" onClick={loadSalesRequests} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {isLoading ? <p className="text-sm text-muted">Loading sales requests...</p> : null}
        {error ? (
          <div className="space-y-2" role="alert">
            <p className="font-semibold">Unable to load sales requests</p>
            <p className="text-sm text-muted">{error}</p>
          </div>
        ) : null}

        {!isLoading && !error && requests.length === 0 ? (
          <div className="space-y-1">
            <p className="font-semibold">No sales requests yet</p>
            <p className="text-sm text-muted">Create your first internal sales request using the button above.</p>
          </div>
        ) : null}

        {!error && requests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Request #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    className="cursor-pointer border-b border-border/70 last:border-b-0 hover:bg-secondary/60"
                    onClick={() => navigate(`/sales-requests/${request.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{request.request_number}</td>
                    <td className="px-4 py-3">{request.customer_name ?? "Walk-in customer"}</td>
                    <td className="px-4 py-3">{formatCurrency(request.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`app-badge ${statusStyles[request.status] ?? "border-border bg-secondary"}`}>
                        {request.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(request.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

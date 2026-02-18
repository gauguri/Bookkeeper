import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type BacklogSummary = {
  total_backlog_value: number;
  open_sales_requests_count: number;
  open_invoices_count: number;
};

type BacklogConsumer = {
  source_type: string;
  source_id: number;
  source_number: string;
  source_status: string;
  customer: string;
  reserved_qty: number;
  backlog_value: number;
  age_days: number;
};

type BacklogItem = {
  item_id: number;
  item_name: string;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  backlog_qty: number;
  shortage_qty: number;
  next_inbound_eta?: string | null;
  consumers: BacklogConsumer[];
};

type BacklogCustomer = {
  customer: string;
  backlog_value: number;
  oldest_request_age_days: number;
  status_mix: string;
  risk_flag: "LOW" | "MEDIUM" | "HIGH" | string;
};

export default function BacklogPage() {
  const [summary, setSummary] = useState<BacklogSummary | null>(null);
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [customers, setCustomers] = useState<BacklogCustomer[]>([]);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadData = async () => {
    setError("");
    try {
      const [summaryData, itemData, customerData] = await Promise.all([
        apiFetch<BacklogSummary>("/backlog/summary"),
        apiFetch<BacklogItem[]>("/backlog/items"),
        apiFetch<BacklogCustomer[]>("/backlog/customers")
      ]);
      setSummary(summaryData);
      setItems(itemData);
      setCustomers(customerData);
      if (!activeItemId && itemData.length > 0) {
        setActiveItemId(itemData[0].item_id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeItem = useMemo(() => items.find((row) => row.item_id === activeItemId) ?? null, [activeItemId, items]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Operational Backlog</h2>
          <p className="text-sm text-muted">Open demand vs inventory reservations with shortage risk visibility.</p>
        </div>
        <button className="app-button-secondary" onClick={loadData}>Refresh</button>
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="app-card p-5">
          <p className="text-xs uppercase text-muted">Total backlog value</p>
          <p className="mt-2 text-2xl font-semibold">{currency(summary?.total_backlog_value ?? 0)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs uppercase text-muted">Open sales requests</p>
          <p className="mt-2 text-2xl font-semibold">{summary?.open_sales_requests_count ?? 0}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs uppercase text-muted">Open invoices</p>
          <p className="mt-2 text-2xl font-semibold">{summary?.open_invoices_count ?? 0}</p>
        </div>
      </section>

      <section className="app-card overflow-x-auto">
        <div className="border-b border-muted/20 px-4 py-3">
          <h3 className="text-lg font-semibold">Item shortages</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">On Hand</th>
              <th className="px-4 py-3">Reserved</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Backlog Qty</th>
              <th className="px-4 py-3">Shortage Qty</th>
              <th className="px-4 py-3">Next inbound ETA</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.item_id}
                className={`cursor-pointer border-t border-muted/20 ${row.item_id === activeItemId ? "bg-primary/5" : ""}`}
                onClick={() => setActiveItemId(row.item_id)}
              >
                <td className="px-4 py-3 font-medium">{row.item_name}</td>
                <td className="px-4 py-3">{Number(row.on_hand_qty).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(row.reserved_qty).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(row.available_qty).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(row.backlog_qty).toFixed(2)}</td>
                <td className={`px-4 py-3 font-semibold ${row.shortage_qty > 0 ? "text-rose-500" : "text-emerald-500"}`}>{Number(row.shortage_qty).toFixed(2)}</td>
                <td className="px-4 py-3">{row.next_inbound_eta ? new Date(row.next_inbound_eta).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="app-card overflow-x-auto">
        <div className="border-b border-muted/20 px-4 py-3">
          <h3 className="text-lg font-semibold">Customer backlog</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Backlog $</th>
              <th className="px-4 py-3">Oldest request age</th>
              <th className="px-4 py-3">Status mix</th>
              <th className="px-4 py-3">Risk flag</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((row) => (
              <tr key={row.customer} className="border-t border-muted/20">
                <td className="px-4 py-3 font-medium">{row.customer}</td>
                <td className="px-4 py-3">{currency(row.backlog_value)}</td>
                <td className="px-4 py-3">{row.oldest_request_age_days} days</td>
                <td className="px-4 py-3">{row.status_mix}</td>
                <td className={`px-4 py-3 font-semibold ${row.risk_flag === "HIGH" ? "text-rose-500" : row.risk_flag === "MEDIUM" ? "text-amber-500" : "text-emerald-500"}`}>{row.risk_flag}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {activeItem ? (
        <section className="app-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Reservation consumers: {activeItem.item_name}</h3>
              <p className="text-sm text-muted">Sales requests or invoices currently consuming inventory reservations.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link className="app-button" to="/purchasing/purchase-orders">Create PO</Link>
              <Link className="app-button-secondary" to="/sales-requests">Prioritize shipments</Link>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Reserved Qty</th>
                <th className="px-2 py-2">Backlog $</th>
                <th className="px-2 py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {activeItem.consumers.map((consumer) => (
                <tr key={`${consumer.source_type}-${consumer.source_id}`} className="border-t border-muted/20">
                  <td className="px-2 py-2">{consumer.source_type === "invoice" ? "Invoice" : "SR"} {consumer.source_number}</td>
                  <td className="px-2 py-2">{consumer.customer}</td>
                  <td className="px-2 py-2">{consumer.source_status}</td>
                  <td className="px-2 py-2">{Number(consumer.reserved_qty).toFixed(2)}</td>
                  <td className="px-2 py-2">{currency(consumer.backlog_value)}</td>
                  <td className="px-2 py-2">{consumer.age_days} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

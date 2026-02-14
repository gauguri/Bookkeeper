import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SalesRequestForm from "../components/SalesRequestForm";
import { apiFetch } from "../api";

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };

type SalesRequestLineDetail = {
  item_id: number;
  quantity: number;
  unit_price: number;
  available_qty: number;
};

type SalesRequestDetail = {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  notes: string | null;
  requested_fulfillment_date: string | null;
  linked_invoice_id: number | null;
  lines: SalesRequestLineDetail[];
};

export default function SalesRequestEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [detail, setDetail] = useState<SalesRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPageData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [customersData, itemsData, detailData] = await Promise.all([
        apiFetch<Customer[]>("/customers"),
        apiFetch<Item[]>("/items"),
        apiFetch<SalesRequestDetail>(`/sales-requests/${id}/detail`)
      ]);
      setCustomers(customersData);
      setItems(itemsData);
      setDetail(detailData);
    } catch (err) {
      setError((err as Error).message || "Unable to load sales request for editing.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const blockedReason = useMemo(() => {
    if (!detail) return "";
    if (detail.status !== "OPEN") return "Only OPEN sales requests can be edited.";
    if (detail.linked_invoice_id) return "This sales request has a linked invoice and cannot be edited.";
    return "";
  }, [detail]);

  if (loading) {
    return <section className="app-card p-6 text-sm text-muted">Loading sales request...</section>;
  }

  if (error || !detail) {
    return (
      <section className="app-card p-6 space-y-3">
        <p className="font-semibold">Unable to load sales request</p>
        <p className="text-sm text-muted">{error || "Sales request not found."}</p>
        <div className="flex gap-2">
          <button className="app-button" onClick={() => void loadPageData()} type="button">
            Retry
          </button>
          <Link className="app-button-ghost" to="/sales-requests">
            Back to sales requests
          </Link>
        </div>
      </section>
    );
  }

  if (blockedReason) {
    return (
      <section className="app-card p-6 space-y-3">
        <p className="font-semibold">Sales request is read-only</p>
        <p className="text-sm text-muted">{blockedReason}</p>
        <div className="flex gap-2">
          <Link className="app-button" to={`/sales-requests/${detail.id}`}>
            Go to details
          </Link>
          <Link className="app-button-ghost" to="/sales-requests">
            Back to sales requests
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Update Sales Request</h2>
        <Link className="app-button-ghost" to={`/sales-requests/${detail.id}`}>
          Back to details
        </Link>
      </header>

      <SalesRequestForm
        mode="edit"
        salesRequestId={detail.id}
        customers={customers}
        items={items}
        initialValues={{
          customer_id: detail.customer_id,
          customer_name: detail.customer_name,
          notes: detail.notes,
          requested_fulfillment_date: detail.requested_fulfillment_date,
          lines: detail.lines.map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            available_qty: line.available_qty
          }))
        }}
        onSaved={() => {
          navigate(`/sales-requests/${detail.id}`, { state: { notice: "Sales request updated" } });
        }}
        onCancel={() => navigate(`/sales-requests/${detail.id}`)}
      />
    </div>
  );
}

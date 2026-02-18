import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { apiFetch } from "../api";
import CustomerInsightsPanel from "../components/CustomerInsightsPanel";

type Customer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  notes?: string;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  billing_address: "",
  shipping_address: "",
  notes: "",
  is_active: true
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedInsightsCustomerId, setSelectedInsightsCustomerId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search) {
      return customers;
    }
    return customers.filter((customer) => customer.name.toLowerCase().includes(search.toLowerCase()));
  }, [customers, search]);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<Customer[]>(`/customers?search=${encodeURIComponent(search)}`);
      setCustomers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setError("");
    try {
      if (editingId) {
        const updated = await apiFetch<Customer>(`/customers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
        setCustomers((prev) => prev.map((customer) => (customer.id === editingId ? updated : customer)));
      } else {
        const created = await apiFetch<Customer>("/customers", {
          method: "POST",
          body: JSON.stringify(form)
        });
        setCustomers((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setSelectedInsightsCustomerId(customer.id);
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      billing_address: customer.billing_address ?? "",
      shipping_address: customer.shipping_address ?? "",
      notes: customer.notes ?? "",
      is_active: customer.is_active
    });
  };

  const archiveCustomer = async (customerId: number) => {
    try {
      const updated = await apiFetch<Customer>(`/customers/${customerId}`, { method: "DELETE" });
      setCustomers((prev) => prev.map((customer) => (customer.id === customerId ? updated : customer)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Customers</p>
          <h1 className="text-3xl font-semibold">Customer ledger</h1>
          <p className="text-muted">Create, segment, and prioritize your best accounts.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("customer-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> New customer
        </button>
      </div>

      <div className="app-card p-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-surface/95 pb-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="app-input w-60"
              placeholder="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="app-button-secondary" onClick={loadCustomers} disabled={loading}>
              Search
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="py-3">Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} className="app-table-row border-t">
                  <td className="py-3 font-medium text-foreground">{customer.name}</td>
                  <td className="text-muted">{customer.email ?? "-"}</td>
                  <td className="text-muted">{customer.phone ?? "-"}</td>
                  <td>
                    <span
                      className={`app-badge ${
                        customer.is_active
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border bg-secondary text-muted"
                      }`}
                    >
                      {customer.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="app-button-ghost" onClick={() => startEdit(customer)}>
                        Edit
                      </button>
                      <button className="app-button-ghost" onClick={() => setSelectedInsightsCustomerId(customer.id)}>
                        Insights
                      </button>
                      <button
                        className="app-button-ghost text-danger"
                        onClick={() => archiveCustomer(customer.id)}
                        disabled={!customer.is_active}
                      >
                        Archive
                      </button>
                      <button className="app-button-ghost" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-secondary" />
                      <p className="font-semibold">No customers found</p>
                      <p className="text-sm text-muted">Create a customer to start sending invoices.</p>
                      <button
                        className="app-button"
                        onClick={() => document.getElementById("customer-form")?.scrollIntoView()}
                      >
                        Create customer
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>



      {selectedInsightsCustomerId ? (
        <CustomerInsightsPanel customerId={selectedInsightsCustomerId} mode="full" />
      ) : null}

      <div id="customer-form" className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{editingId ? "Edit customer" : "New customer"}</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">Customer profile</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="app-input"
            placeholder="Name *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Billing address"
            value={form.billing_address}
            onChange={(event) => setForm({ ...form, billing_address: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Shipping address"
            value={form.shipping_address}
            onChange={(event) => setForm({ ...form, shipping_address: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
            />
            Active
          </label>
          <div className="flex items-center gap-2">
            {editingId && (
              <button
                className="app-button-secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
            <button className="app-button" onClick={handleSubmit}>
              {editingId ? "Save changes" : "Create customer"}
            </button>
          </div>
        </div>
      </div>

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("customer-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}

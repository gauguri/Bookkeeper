import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

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
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Customers</h1>
        <p className="text-slate-600">Create and manage customer profiles.</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <input
              className="border border-slate-300 rounded px-3 py-2 text-sm"
              placeholder="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="bg-slate-900 text-white rounded px-3 py-2 text-sm"
              onClick={loadCustomers}
              disabled={loading}
            >
              Search
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} className="border-t border-slate-100">
                  <td className="py-2">{customer.name}</td>
                  <td>{customer.email ?? "-"}</td>
                  <td>{customer.phone ?? "-"}</td>
                  <td>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        customer.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {customer.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="text-right space-x-2">
                    <button className="text-slate-700 text-sm" onClick={() => startEdit(customer)}>
                      Edit
                    </button>
                    <button
                      className="text-rose-600 text-sm"
                      onClick={() => archiveCustomer(customer.id)}
                      disabled={!customer.is_active}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">{editingId ? "Edit customer" : "New customer"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Name *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Billing address"
            value={form.billing_address}
            onChange={(event) => setForm({ ...form, billing_address: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Shipping address"
            value={form.shipping_address}
            onChange={(event) => setForm({ ...form, shipping_address: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
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
                className="border border-slate-300 rounded px-3 py-2 text-sm"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
            <button className="bg-slate-900 text-white rounded px-4 py-2 text-sm" onClick={handleSubmit}>
              {editingId ? "Save changes" : "Create customer"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

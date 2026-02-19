import { useMemo, useState } from "react";
import { apiFetch } from "../api";
import { currency, formatNumber } from "../utils/format";

type ARAgingRow = {
  customer_id: number;
  customer_name: string;
  current: number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
  total: number;
  avg_days_to_pay: number | null;
  follow_up_date: string | null;
  last_action_type: string | null;
};

export default function ARAgingPage() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ARAgingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [followUps, setFollowUps] = useState<Record<number, string>>({});

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.current += row.current;
          acc.bucket31 += row["31_60"];
          acc.bucket61 += row["61_90"];
          acc.bucket90 += row["90_plus"];
          acc.total += row.total;
          return acc;
        },
        { current: 0, bucket31: 0, bucket61: 0, bucket90: 0, total: 0 }
      ),
    [rows]
  );

  const loadAging = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<ARAgingRow[]>(`/ar/aging?as_of=${asOf}`);
      setRows(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitNote = async (customerId: number) => {
    const note = (notes[customerId] || "").trim();
    if (!note && !followUps[customerId]) return;
    await apiFetch("/ar/notes", {
      method: "POST",
      body: JSON.stringify({
        customer_id: customerId,
        note: note || "Follow-up date updated.",
        follow_up_date: followUps[customerId] || null
      })
    });
    setNotes((prev) => ({ ...prev, [customerId]: "" }));
    await loadAging();
  };

  const sendReminder = async (customerId: number) => {
    await apiFetch("/ar/reminders", {
      method: "POST",
      body: JSON.stringify({
        customer_id: customerId,
        note: (notes[customerId] || "").trim() || "Payment reminder sent.",
        follow_up_date: followUps[customerId] || null,
        channel: "EMAIL"
      })
    });
    setNotes((prev) => ({ ...prev, [customerId]: "" }));
    await loadAging();
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Finance</p>
          <h1 className="text-3xl font-semibold">Accounts receivable aging</h1>
          <p className="text-muted">Track overdue balances and log collection activity by customer.</p>
        </div>
        <div className="flex items-center gap-3">
          <input className="app-input" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          <button className="app-button" onClick={loadAging} disabled={loading}>
            {loading ? "Loading..." : "Run aging"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="app-card overflow-x-auto p-4">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="py-3">Customer</th>
              <th className="text-right">Current (0-30)</th>
              <th className="text-right">31-60</th>
              <th className="text-right">61-90</th>
              <th className="text-right">90+</th>
              <th className="text-right">Total</th>
              <th className="text-right">Avg days to pay</th>
              <th className="text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.customer_id} className="border-t align-top">
                <td className="py-3 font-medium">{row.customer_name}</td>
                <td className="text-right tabular-nums">{currency(row.current)}</td>
                <td className="text-right tabular-nums">{currency(row["31_60"])}</td>
                <td className="text-right tabular-nums">{currency(row["61_90"])}</td>
                <td className="text-right tabular-nums">{currency(row["90_plus"])}</td>
                <td className="text-right tabular-nums font-semibold">{currency(row.total)}</td>
                <td className="text-right tabular-nums">{formatNumber(row.avg_days_to_pay, 1)}</td>
                <td className="min-w-[320px] py-3">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button className="app-button" onClick={() => sendReminder(row.customer_id)}>
                        Send reminder
                      </button>
                      <button className="app-button-secondary" onClick={() => submitNote(row.customer_id)}>
                        Add note
                      </button>
                    </div>
                    <textarea
                      className="app-input min-h-[72px]"
                      placeholder="Collection note"
                      value={notes[row.customer_id] || ""}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [row.customer_id]: event.target.value }))}
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted">Follow-up</label>
                      <input
                        className="app-input"
                        type="date"
                        value={followUps[row.customer_id] ?? row.follow_up_date ?? ""}
                        onChange={(event) =>
                          setFollowUps((prev) => ({
                            ...prev,
                            [row.customer_id]: event.target.value
                          }))
                        }
                      />
                      {row.last_action_type && <span className="text-xs text-muted">Last: {row.last_action_type}</span>}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  No open receivables in the selected aging window.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface/40 font-semibold">
              <td className="py-3">Total</td>
              <td className="text-right tabular-nums">{currency(totals.current)}</td>
              <td className="text-right tabular-nums">{currency(totals.bucket31)}</td>
              <td className="text-right tabular-nums">{currency(totals.bucket61)}</td>
              <td className="text-right tabular-nums">{currency(totals.bucket90)}</td>
              <td className="text-right tabular-nums">{currency(totals.total)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

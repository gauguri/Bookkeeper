import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

export type BankAccount = {
  id: number;
  name: string;
  institution: string;
  account_type: string;
  last4: string;
  currency: string;
  opening_balance: number;
  current_balance: number | null;
  status: string;
};

export type BankTransaction = {
  id: number;
  bank_account_id: number;
  posted_date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "debit" | "credit";
  category: string | null;
  vendor: string | null;
  reference: string | null;
  source: string;
  status: "new" | "categorized" | "matched" | "reconciled" | "excluded";
  excluded_reason: string | null;
  created_at: string;
};

export type DashboardPayload = {
  kpis: {
    cash_balance: number;
    unreconciled_transactions: number;
    items_needing_review: number;
    reconciled_this_month: number;
    exceptions_count: number;
  };
  cash_trend: { day: string; balance: number }[];
  category_breakdown: { category: string; value: number }[];
  reconciliation_progress: { account: string; reconciled: number; unreconciled: number }[];
};

export type ReconciliationSession = {
  id: number;
  bank_account_id: number;
  period_start: string;
  period_end: string;
  statement_ending_balance: number;
  status: "open" | "closed";
  reconciled_at: string | null;
  created_by: number | null;
  created_at: string;
};

export type ReconciliationWorkspace = {
  session: ReconciliationSession;
  cleared_count: number;
  uncleared_count: number;
  difference: number;
  uncleared_transactions: BankTransaction[];
  needs_review_transactions: BankTransaction[];
  candidates: Record<number, { entity_type: string; entity_id: number; description: string; date: string; amount: number; confidence: number }[]>;
};

function makeQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return search.toString() ? `?${search.toString()}` : "";
}

export function useBankingDashboard() {
  return useQuery({ queryKey: ["banking", "dashboard"], queryFn: () => apiFetch<DashboardPayload>("/banking/dashboard") });
}

export function useBankAccounts() {
  return useQuery({ queryKey: ["banking", "accounts"], queryFn: () => apiFetch<BankAccount[]>("/banking/accounts") });
}

export function useBankTransactions(filters: Record<string, string | undefined>) {
  const query = makeQuery(filters);
  return useQuery({
    queryKey: ["banking", "transactions", query],
    queryFn: () => apiFetch<{ items: BankTransaction[]; total: number }>(`/banking/transactions${query}`),
  });
}

export function usePatchBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Record<string, unknown> }) =>
      apiFetch<BankTransaction>(`/banking/transactions/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["banking", "dashboard"] });
    },
  });
}

export function useImportCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { bank_account_id: number; rows: Record<string, string>[] }) =>
      apiFetch<{ imported_count: number; errors: string[] }>("/banking/import-csv", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking"] });
    },
  });
}

export function useReconciliationSessions() {
  return useQuery({ queryKey: ["banking", "reconciliation", "sessions"], queryFn: () => apiFetch<ReconciliationSession[]>("/banking/reconciliation/sessions") });
}

export function useCreateReconciliationSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { bank_account_id: number; period_start: string; period_end: string; statement_ending_balance: number }) =>
      apiFetch<ReconciliationSession>("/banking/reconciliation/sessions", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation", "sessions"] });
    },
  });
}

export function useReconciliationWorkspace(sessionId?: number) {
  return useQuery({
    queryKey: ["banking", "reconciliation", "workspace", sessionId],
    queryFn: () => apiFetch<ReconciliationWorkspace>(`/banking/reconciliation/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { bank_transaction_id: number; linked_entity_type: string; linked_entity_id: number; match_confidence?: number; match_type: string }) =>
      apiFetch("/banking/matches", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["banking", "transactions"] });
    },
  });
}

export function useCloseReconciliationSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, force }: { sessionId: number; force?: boolean }) =>
      apiFetch(`/banking/reconciliation/sessions/${sessionId}/close${force ? "?force=true" : ""}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["banking", "dashboard"] });
    },
  });
}

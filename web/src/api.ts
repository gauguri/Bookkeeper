export const API_BASE = "/api";
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export type ApiError = {
  detail?: string | { message?: string };
};

export type ApiRequestError = Error & {
  status: number;
};

export type PurchaseOrderLinePayload = {
  item_id: number;
  quantity: number;
  unit_cost?: number | null;
  freight_cost?: number | null;
  tariff_cost?: number | null;
};

export type PurchaseOrderPayload = {
  po_number?: string;
  supplier_id: number;
  order_date: string;
  expected_date?: string | null;
  notes?: string | null;
  freight_cost?: number;
  tariff_cost?: number;
  lines: PurchaseOrderLinePayload[];
};

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = (await response.json()) as ApiError;
      if (data.detail) {
        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (typeof data.detail === "object" && data.detail.message) {
          message = data.detail.message;
        } else {
          message = JSON.stringify(data.detail);
        }
      }
    } catch (error) {
      // ignore parse errors
    }
    const requestError = new Error(message) as ApiRequestError;
    requestError.status = response.status;
    throw requestError;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listPurchaseOrders<T>() {
  return apiFetch<T>("/purchase-orders");
}

export function createPurchaseOrder<T>(payload: PurchaseOrderPayload) {
  return apiFetch<T>("/purchase-orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getPurchaseOrder<T>(id: number) {
  return apiFetch<T>(`/purchase-orders/${id}`);
}

export function updatePurchaseOrder<T>(id: number, payload: PurchaseOrderPayload) {
  return apiFetch<T>(`/purchase-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function sendPurchaseOrder<T>(id: number) {
  return apiFetch<T>(`/purchase-orders/${id}/send`, { method: "POST" });
}

export function getPurchaseOrderAccountingPreview<T>(id: number) {
  return apiFetch<T>(`/purchase-orders/${id}/accounting-preview`);
}

export function postPurchaseOrderReceipt<T>(
  id: number,
  payload: { date: string; memo?: string | null; inventory_account_id?: number | null; cash_account_id?: number | null }
) {
  return apiFetch<T>(`/purchase-orders/${id}/post-receipt`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createJournalEntry<T>(payload: {
  date: string;
  memo?: string | null;
  source_type: "MANUAL" | "PURCHASE_ORDER";
  source_id?: number | null;
  lines: { account_id: number; direction: "DEBIT" | "CREDIT"; amount: number }[];
}) {
  return apiFetch<T>("/journal-entries", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listJournalEntries<T>(query = "") {
  return apiFetch<T>(`/journal-entries${query ? `?${query}` : ""}`);
}

export function deletePurchaseOrder(id: number) {
  return apiFetch<void>(`/purchase-orders/${id}`, { method: "DELETE" });
}

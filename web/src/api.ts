export const API_BASE = "/api";

export type ApiError = {
  detail?: string;
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
  lines: PurchaseOrderLinePayload[];
};

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = (await response.json()) as ApiError;
      if (data.detail) {
        message = data.detail;
      }
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(message);
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

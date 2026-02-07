export const API_BASE = "/api";

export type ApiError = {
  detail?: string;
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

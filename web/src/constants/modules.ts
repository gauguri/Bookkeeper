export const MODULES = {
  DASHBOARD: "DASHBOARD",
  CUSTOMERS: "CUSTOMERS",
  ITEMS: "ITEMS",
  SALES_REQUESTS: "SALES_REQUESTS",
  INVOICES: "INVOICES",
  PAYMENTS: "PAYMENTS",
  SUPPLIERS: "SUPPLIERS",
  PURCHASE_ORDERS: "PURCHASE_ORDERS",
  INVENTORY: "INVENTORY",
  CHART_OF_ACCOUNTS: "CHART_OF_ACCOUNTS",
  EXPENSES: "EXPENSES",
  REPORTS: "REPORTS",
  IMPORT: "IMPORT",
  BANKING: "BANKING",
  CONTROL: "CONTROL"
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];

const moduleValues = Object.values(MODULES) as ModuleKey[];
const moduleSet = new Set<ModuleKey>(moduleValues);

export function normalizeModuleKey(moduleKey: string): ModuleKey | null {
  const normalized = moduleKey.trim().toUpperCase();
  return moduleSet.has(normalized as ModuleKey) ? (normalized as ModuleKey) : null;
}

export function normalizeModuleKeys(moduleKeys: readonly string[]): ModuleKey[] {
  return moduleKeys.map(normalizeModuleKey).filter((moduleKey): moduleKey is ModuleKey => Boolean(moduleKey));
}

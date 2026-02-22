import { canAccess } from "./authz";
import { MODULES, ModuleKey } from "./constants/modules";

type AccessContext = { isAdmin: boolean; allowedModules: ModuleKey[] };

export const MODULE_ROUTE_MAP: Record<ModuleKey, string> = {
  [MODULES.DASHBOARD]: "/analytics",
  [MODULES.SALES_REQUESTS]: "/sales-requests",
  [MODULES.INVOICES]: "/invoices",
  [MODULES.PAYMENTS]: "/payments",
  [MODULES.INVENTORY]: "/inventory",
  [MODULES.PURCHASE_ORDERS]: "/purchasing/purchase-orders",
  [MODULES.SUPPLIERS]: "/purchasing/suppliers",
  [MODULES.CHART_OF_ACCOUNTS]: "/accounts",
  [MODULES.EXPENSES]: "/expenses",
  [MODULES.REPORTS]: "/analytics",
  [MODULES.IMPORT]: "/accounts/bulk-import",
  [MODULES.CONTROL]: "/control",
  [MODULES.CUSTOMERS]: "/sales/customers",
  [MODULES.ITEMS]: "/sales/items",
  [MODULES.BANKING]: "/banking"
};

const LIMITED_USER_DEFAULT_PRIORITY: ModuleKey[] = [
  MODULES.SALES_REQUESTS,
  MODULES.INVOICES,
  MODULES.PAYMENTS,
  MODULES.INVENTORY,
  MODULES.PURCHASE_ORDERS,
  MODULES.SUPPLIERS,
  MODULES.CHART_OF_ACCOUNTS,
  MODULES.EXPENSES,
  MODULES.REPORTS,
  MODULES.IMPORT,
  MODULES.CUSTOMERS,
  MODULES.ITEMS,
  MODULES.BANKING,
  MODULES.CONTROL,
  MODULES.DASHBOARD
];

const modulePathMatchers: Array<{ moduleKey: ModuleKey; matches: (pathname: string) => boolean }> = [
  { moduleKey: MODULES.DASHBOARD, matches: (pathname) => pathname === "/" || pathname === "/sales" || pathname === "/analytics" },
  { moduleKey: MODULES.CUSTOMERS, matches: (pathname) => pathname.startsWith("/sales/customers") },
  { moduleKey: MODULES.ITEMS, matches: (pathname) => pathname.startsWith("/sales/items") },
  { moduleKey: MODULES.SALES_REQUESTS, matches: (pathname) => pathname.startsWith("/sales-requests") },
  { moduleKey: MODULES.INVOICES, matches: (pathname) => pathname.startsWith("/sales/invoices") || pathname.startsWith("/invoices") },
  { moduleKey: MODULES.PAYMENTS, matches: (pathname) => pathname.startsWith("/sales/payments") || pathname.startsWith("/payments") },
  { moduleKey: MODULES.REPORTS, matches: (pathname) => pathname.startsWith("/sales/reports") || pathname.startsWith("/finance/ar-aging") || pathname.startsWith("/finance/cash-forecast") || pathname.startsWith("/analytics") },
  { moduleKey: MODULES.EXPENSES, matches: (pathname) => pathname.startsWith("/expenses") },
  { moduleKey: MODULES.BANKING, matches: (pathname) => pathname.startsWith("/banking") },
  { moduleKey: MODULES.IMPORT, matches: (pathname) => pathname.startsWith("/accounts/bulk-import") },
  { moduleKey: MODULES.CHART_OF_ACCOUNTS, matches: (pathname) => pathname.startsWith("/accounts") },
  { moduleKey: MODULES.SUPPLIERS, matches: (pathname) => pathname.startsWith("/purchasing/suppliers") },
  { moduleKey: MODULES.PURCHASE_ORDERS, matches: (pathname) => pathname.startsWith("/purchasing/purchase-orders") },
  { moduleKey: MODULES.INVENTORY, matches: (pathname) => pathname.startsWith("/inventory") || pathname.startsWith("/operations/backlog") || pathname.startsWith("/backlog") },
  { moduleKey: MODULES.CONTROL, matches: (pathname) => pathname.startsWith("/control") }
];

export function getDefaultRoute({ isAdmin, allowedModules }: AccessContext): string {
  if (isAdmin) {
    return MODULE_ROUTE_MAP[MODULES.DASHBOARD];
  }

  for (const moduleKey of LIMITED_USER_DEFAULT_PRIORITY) {
    if (canAccess(moduleKey, { is_admin: false, allowed_modules: allowedModules })) {
      return MODULE_ROUTE_MAP[moduleKey];
    }
  }

  return "/no-access";
}

export function getModuleForPath(pathname: string): ModuleKey | null {
  const matching = modulePathMatchers.find((matcher) => matcher.matches(pathname));
  return matching?.moduleKey ?? null;
}

export function isPathAllowed(pathname: string, access: AccessContext): boolean {
  const moduleKey = getModuleForPath(pathname);
  if (!moduleKey) {
    return true;
  }
  return canAccess(moduleKey, { is_admin: access.isAdmin, allowed_modules: access.allowedModules });
}

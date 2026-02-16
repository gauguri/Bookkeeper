import { MODULES, ModuleKey, normalizeModuleKeys } from "./constants/modules";

type AccessUser = {
  is_admin?: boolean;
  allowed_modules?: string[];
};

export function canAccess(moduleKey: ModuleKey, user: AccessUser | null): boolean {
  if (!user) {
    return false;
  }
  if (user.is_admin) {
    return true;
  }

  if (moduleKey === MODULES.CONTROL) {
    return false;
  }

  const allowed = normalizeModuleKeys(user.allowed_modules ?? []);
  return allowed.includes(moduleKey);
}

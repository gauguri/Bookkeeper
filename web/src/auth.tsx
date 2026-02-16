import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setAuthToken } from "./api";
import { ModuleKey, normalizeModuleKeys } from "./constants/modules";

type AuthUser = {
  id: number;
  email: string;
  full_name?: string | null;
  is_admin: boolean;
};

type AuthUserWithModules = AuthUser & { allowed_modules: string[] };

type MeResponse = AuthUserWithModules;

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  allowedModules: ModuleKey[];
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem("bookkeeper-token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [allowedModules, setAllowedModules] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me);
    setAllowedModules(normalizeModuleKeys(me.allowed_modules ?? []));
  };

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setUser(null);
      setAllowedModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshProfile()
      .catch(() => {
        window.localStorage.removeItem("bookkeeper-token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      allowedModules,
      isAdmin: Boolean(user?.is_admin),
      loading,
      login: async (email, password) => {
        const response = await apiFetch<{ access_token: string; user: AuthUserWithModules }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        window.localStorage.setItem("bookkeeper-token", response.access_token);
        setAuthToken(response.access_token);
        setUser(response.user);
        setAllowedModules(normalizeModuleKeys(response.user.allowed_modules ?? []));
        setToken(response.access_token);
      },
      refreshProfile,
      logout: () => {
        window.localStorage.removeItem("bookkeeper-token");
        setToken(null);
      }
    }),
    [allowedModules, loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

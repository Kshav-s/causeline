import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Capabilities, User } from "../types/api";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    api.get<{ user: User | null }>("/api/auth/session").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onUnauth = () => { setUser(null); qc.clear(); };
    window.addEventListener("causeline:unauthorized", onUnauth);
    return () => window.removeEventListener("causeline:unauthorized", onUnauth);
  }, [qc]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", user?.theme === "dark");
  }, [user?.theme]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<User>("/api/auth/login", { email, password });
    qc.clear();
    setUser(u);
    return u;
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    qc.clear();
    setUser(null);
    document.documentElement.classList.remove("dark");
  }, [qc]);

  const value = useMemo(() => ({ user, loading, login, logout, setUser }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export function useCapabilities() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["capabilities"], queryFn: () => api.get<Capabilities>("/api/meta/capabilities"), enabled: !!user, staleTime: 30_000 });
}

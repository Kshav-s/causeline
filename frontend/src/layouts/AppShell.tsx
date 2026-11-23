import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell, BrainCircuit, ChevronsLeft, ChevronsRight, ClipboardList, Cpu, Database, FileBarChart2, FlaskConical, GitBranch,
  LayoutDashboard, LineChart, ListChecks, LogOut, Menu, Moon, PlusCircle, ScrollText, Search, Settings, ShieldAlert, Sun, Users, X,
} from "lucide-react";
import { useAuth, useCapabilities } from "../hooks/auth";
import { api } from "../services/api";
import { Logo } from "../components/domain/Logo";
import { Drawer } from "../components/ui/overlays";
import { cx, fmtDateTime } from "../utils/format";
import type { User } from "../types/api";

function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

type Item = { to: string; label: string; icon: ComponentType<{ className?: string }>; module?: string; end?: boolean };
type Group = { label: string; items: Item[]; admin?: boolean };

function useNav(): Group[] {
  const { data: caps } = useCapabilities();
  const { user } = useAuth();
  const m = caps?.modules ?? {};
  const groups: Group[] = [
    { label: "Overview", items: [{ to: "/app", label: "Overview", icon: LayoutDashboard, end: true }] },
    { label: "Complaints", items: [{ to: "/app/complaints", label: "Complaint register", icon: ClipboardList, end: true }, { to: "/app/complaints/new", label: "New complaint", icon: PlusCircle }] },
    { label: "Intelligence", items: [{ to: "/app/ai", label: "AI analysis", icon: BrainCircuit, module: "ai_analysis" }, { to: "/app/root-cause", label: "Root cause intelligence", icon: GitBranch, module: "root_cause" }] },
    { label: "Quality", items: [{ to: "/app/capa", label: "CAPA effectiveness", icon: ListChecks, module: "capa" },
      { to: "/app/risk", label: m.risk_level === "batch" ? "Product & batch risk" : "Product risk", icon: ShieldAlert, module: "risk" }] },
    { label: "Insights", items: [{ to: "/app/analytics", label: "Analytics", icon: LineChart, module: "analytics" }, { to: "/app/reports", label: "Reports", icon: FileBarChart2, module: "reports" }] },
    { label: "Data", items: [{ to: "/app/data", label: "Data management", icon: Database, module: "data_management" }] },
    { label: "Admin", admin: true, items: [{ to: "/app/admin/users", label: "Users & roles", icon: Users },
      { to: "/app/admin/models", label: "Model registry", icon: Cpu }, { to: "/app/admin/audit", label: "Audit log", icon: ScrollText }] },
  ];
  // Hide (never grey out) modules the backend reports as unsupported - CLAUDE.md §14.
  return groups
    .filter((g) => !g.admin || user?.role === "admin")
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.module || !caps || m[i.module] !== false) }))
    .filter((g) => g.items.length);
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = useNav();
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto py-3">
      {groups.map((g) => (
        <div key={g.label} className="mb-3">
          {!collapsed && <div className="overline text-graphite-400 px-5 mb-1">{g.label}</div>}
          <ul className="px-2 space-y-0.5">
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} end={i.end} onClick={onNavigate} title={collapsed ? i.label : undefined}
                  className={({ isActive }) => cx("flex items-center gap-3 rounded-[var(--radius-control)] h-9 text-[13px] font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    isActive ? "bg-petrol-500/20 text-white" : "text-graphite-300 hover:bg-white/5 hover:text-white")}>
                  {({ isActive }) => (<><i.icon className={cx("size-5 shrink-0", isActive && "text-petrol-400")} />{!collapsed && <span className="truncate">{i.label}</span>}</>)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="px-2 border-t border-white/10 pt-3">
        <NavLink to="/app/settings" onClick={onNavigate} title={collapsed ? "Settings" : undefined}
          className={({ isActive }) => cx("flex items-center gap-3 rounded-[var(--radius-control)] h-9 text-[13px] font-medium", collapsed ? "justify-center" : "px-3",
            isActive ? "bg-petrol-500/20 text-white" : "text-graphite-300 hover:bg-white/5 hover:text-white")}>
          <Settings className="size-5" />{!collapsed && "Settings"}
        </NavLink>
      </div>
    </nav>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ items: { id: number; kind: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }[]; unread: number }>("/api/notifications"), refetchInterval: 60_000 });
  const read = useMutation({ mutationFn: (id: number) => api.post(`/api/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const readAll = useMutation({ mutationFn: () => api.post("/api/notifications/read-all"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const unread = data?.unread ?? 0;
  return (
    <>
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen(true)} className="relative size-9 grid place-items-center rounded-[var(--radius-control)] hover:bg-surface-hover text-ink-2">
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--bad-fg)] text-white text-[10px] font-semibold leading-4 num">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="Notifications">
        {unread > 0 && <button className="text-[13px] text-link hover:underline mb-3" onClick={() => readAll.mutate()}>Mark all as read</button>}
        {!data?.items.length && <p className="text-muted text-[13px]">No notifications yet. Finished imports, new demo bookings and other events appear here.</p>}
        <ul className="divide-y divide-line">
          {data?.items.map((n) => (
            <li key={n.id}>
              <button className="w-full text-left py-3 flex gap-3" onClick={() => { if (!n.read) read.mutate(n.id); if (n.link) { setOpen(false); nav(n.link); } }}>
                <span className={cx("mt-1.5 size-2 rounded-full shrink-0", n.read ? "bg-transparent" : "bg-petrol-500")} aria-hidden />
                <span className="min-w-0">
                  <span className={cx("block text-[13px]", n.read ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</span>
                  {n.body && <span className="block text-[12px] text-muted mt-0.5">{n.body}</span>}
                  <span className="block text-[11px] text-faint mt-1">{fmtDateTime(n.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); document.getElementById("global-search")?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <form role="search" className="relative flex-1 max-w-md max-md:hidden" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/app/complaints?q=${encodeURIComponent(q.trim())}`); }}>
      <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search complaint ID, batch, product, text…" aria-label="Search complaints"
        className="w-full h-9 rounded-[var(--radius-control)] border border-line bg-surface-2 pl-8 pr-14 text-[13px] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-petrol-400" />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-faint border border-line rounded px-1 font-mono">Ctrl K</kbd>
    </form>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.replace(/^\/app\/?/, "").split("/").filter(Boolean);
  const names: Record<string, string> = { complaints: "Complaints", ai: "AI analysis", "root-cause": "Root cause", capa: "CAPA", risk: "Risk", analytics: "Analytics", reports: "Reports", data: "Data management", admin: "Admin", bookings: "Demo bookings", users: "Users", models: "Model registry", audit: "Audit log", settings: "Settings", new: "New" };
  return (
    <ol className="flex items-center gap-1.5 text-[13px] text-muted min-w-0 max-lg:hidden" aria-label="Breadcrumb">
      <li><Link to="/app" className="hover:text-ink">Overview</Link></li>
      {parts.map((p, i) => (
        <li key={i} className="flex items-center gap-1.5 min-w-0"><span aria-hidden>/</span>
          {i < parts.length - 1 ? <Link to={`/app/${parts.slice(0, i + 1).join("/")}`} className="hover:text-ink">{names[p] ?? decodeURIComponent(p)}</Link> : <span className="text-ink truncate font-mono text-[12px]">{names[p] ?? decodeURIComponent(p)}</span>}
        </li>
      ))}
    </ol>
  );
}

export function AppShell() {
  const { user, logout, setUser } = useAuth();
  const { data: caps } = useCapabilities();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const rail = collapsed || !isDesktop; // md-lg: 64px icon rail (DESIGN_SYSTEM §6)
  const nav = useNavigate();
  const toggleTheme = async () => {
    if (!user) return;
    const theme = user.theme === "dark" ? "light" : "dark";
    setUser({ ...user, theme });
    await api.patch<User>("/api/auth/me", { theme }).catch(() => undefined);
  };
  return (
    <div className="min-h-full flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-2 focus:left-2 focus:bg-surface focus:px-3 focus:py-2 focus:rounded">Skip to content</a>
      {/* Desktop / tablet sidebar */}
      <aside className={cx("max-md:hidden sticky top-0 h-screen shrink-0 bg-graphite-900 flex flex-col transition-[width] duration-150", rail ? "w-16" : "w-[248px]")}>
        <div className={cx("h-14 flex items-center border-b border-white/10", rail ? "justify-center" : "px-5")}>
          <Link to="/app" aria-label="CauseLine home"><Logo inverse compact={rail} /></Link>
        </div>
        <SidebarNav collapsed={rail} />
        {isDesktop && (
          <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="h-10 border-t border-white/10 text-graphite-400 hover:text-white grid place-items-center">
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        )}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-graphite-950/60" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-graphite-900 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/10">
              <Logo inverse /><button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="size-10 grid place-items-center text-graphite-300"><X className="size-5" /></button>
            </div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-surface/95 backdrop-blur border-b border-line flex items-center gap-3 px-4 md:px-6 no-print">
          <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="md:hidden size-10 -ml-2 grid place-items-center text-ink-2"><Menu className="size-5" /></button>
          <span className="md:hidden"><Logo compact /></span>
          <Breadcrumbs />
          <div className="flex-1 flex justify-center"><GlobalSearch /></div>
          {caps?.data.demo_data && (
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-semibold uppercase tracking-wide max-sm:hidden"
              style={{ color: "var(--pv-demo-fg)", background: "var(--pv-demo-bg)", borderColor: "var(--pv-demo-bd)" }} title="All records are synthetic demonstration data (SYNTHETIC_ABT_CPD)">
              <FlaskConical className="size-3" />Demo data
            </span>
          )}
          <Notifications />
          <button aria-label={user?.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme} className="size-9 grid place-items-center rounded-[var(--radius-control)] hover:bg-surface-hover text-ink-2 max-sm:hidden">
            {user?.theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label="Account menu" className="size-9 rounded-full bg-petrol-600 text-white text-[13px] font-semibold grid place-items-center">
              {user?.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-60 rounded-[var(--radius-card)] border border-line bg-surface shadow-pop p-1 text-[13px]">
                <div className="px-3 py-2 border-b border-line mb-1">
                  <div className="font-semibold text-ink truncate">{user?.full_name}</div>
                  <div className="text-muted truncate">{user?.email}</div>
                  <span className="inline-block mt-1.5 text-[11px] uppercase tracking-wide font-semibold text-link">{user?.role}</span>
                </div>
                <DropdownMenu.Item onSelect={() => nav("/app/settings")} className="flex items-center gap-2 px-3 h-9 rounded cursor-pointer outline-none data-[highlighted]:bg-surface-hover"><Settings className="size-4" />Settings</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={toggleTheme} className="sm:hidden flex items-center gap-2 px-3 h-9 rounded cursor-pointer outline-none data-[highlighted]:bg-surface-hover"><Moon className="size-4" />Toggle theme</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={async () => { await logout(); nav("/"); }} className="flex items-center gap-2 px-3 h-9 rounded cursor-pointer outline-none data-[highlighted]:bg-surface-hover"><LogOut className="size-4" />Sign out</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>
        <main id="main" className="flex-1 w-full max-w-[1600px] mx-auto px-4 md:px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

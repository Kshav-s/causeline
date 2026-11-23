import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "../components/domain/Logo";
import { useAuth } from "../hooks/auth";

export function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [{ to: "/#modules", label: "Modules" }, { to: "/#how", label: "How it works" }, { to: "/#ai", label: "How we treat AI" }, { to: "/#faq", label: "FAQ" }];
  return (
    <div className="min-h-full flex flex-col bg-canvas">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link to="/" aria-label="CauseLine home"><Logo inverse /></Link>
          <nav aria-label="Primary" className="max-md:hidden flex items-center gap-6 text-[13px] text-graphite-300">
            {links.map((l) => <a key={l.to} href={l.to} className="hover:text-white">{l.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to={user ? "/app" : "/login"} className="max-sm:hidden h-9 px-4 inline-flex items-center rounded-[var(--radius-control)] border border-white/20 text-white text-sm font-medium hover:bg-white/10">{user ? "Open app" : "Sign in"}</Link>
            <NavLink to="/demo" className="h-9 px-4 inline-flex items-center rounded-[var(--radius-control)] bg-petrol-500 text-white text-sm font-medium hover:bg-petrol-600">Request a demo</NavLink>
            <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)} className="md:hidden size-10 grid place-items-center text-white">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {open && (
          <nav aria-label="Mobile" className="md:hidden bg-graphite-900 border-t border-white/10 px-5 py-3 flex flex-col">
            {links.map((l) => <a key={l.to} href={l.to} onClick={() => setOpen(false)} className="h-11 flex items-center text-graphite-200">{l.label}</a>)}
            <Link to={user ? "/app" : "/login"} className="h-11 flex items-center text-white font-medium">{user ? "Open app" : "Sign in"}</Link>
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-graphite-950 text-graphite-400 text-[13px]">
        <div className="max-w-[1200px] mx-auto px-5 py-12 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo inverse />
            <p className="mt-3 max-w-sm">Complaint analytics and prediction for ABT CPD quality teams. Every insight shows where it came from: recorded fact, rule, or model output.</p>
          </div>
          <div>
            <div className="overline text-graphite-500 mb-3">Platform</div>
            <ul className="space-y-2"><li><a href="/#modules" className="hover:text-white">Modules</a></li><li><a href="/#ai" className="hover:text-white">How we treat AI output</a></li><li><a href="/#faq" className="hover:text-white">FAQ</a></li></ul>
          </div>
          <div>
            <div className="overline text-graphite-500 mb-3">Get started</div>
            <ul className="space-y-2"><li><Link to="/demo" className="hover:text-white">Request a demo</Link></li><li><Link to="/login" className="hover:text-white">Sign in</Link></li></ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-[1200px] mx-auto px-5 py-4 flex flex-wrap justify-between gap-2 text-[12px]">
            <span>© {new Date().getFullYear()} CauseLine · ABT CPD</span>
            <span>Demonstration environment - data shown in the product is synthetic.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

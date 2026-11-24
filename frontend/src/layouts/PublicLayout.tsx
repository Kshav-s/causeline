import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import { Logo } from "../components/domain/Logo";

/** Public site chrome. No sign-in anywhere: visitors raise and track complaints without an account.
 * Staff use /staff, which is intentionally not linked from public pages. */
export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Route changes start at the top, unless the link targets a section (#how, #ai...).
  useEffect(() => { if (!hash) window.scrollTo(0, 0); else document.getElementById(hash.slice(1))?.scrollIntoView(); }, [pathname, hash]);
  const links = [{ to: "/#modules", label: "Platform" }, { to: "/#how", label: "How it works" }, { to: "/#ai", label: "How we treat AI" }, { to: "/#faq", label: "FAQ" }];
  const pages = [{ to: "/register", label: "Complaint register" }, { to: "/track", label: "Track a complaint" }];
  return (
    <div className="min-h-full flex flex-col bg-canvas text-[16px] leading-[1.6]">
      <header className={`fixed inset-x-0 top-0 z-30 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${scrolled || open ? "bg-graphite-950/90 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.08)]" : "bg-transparent"}`}>
        <div className="max-w-[1200px] mx-auto px-5 h-[68px] flex items-center justify-between gap-4">
          <Link to="/" aria-label="CauseLine home"><Logo inverse /></Link>
          <nav aria-label="Primary" className="max-lg:hidden flex items-center gap-7 text-[15px] font-semibold text-graphite-200">
            {links.map((l) => <a key={l.to} href={l.to} className="relative py-1 hover:text-white after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-petrol-400 after:transition-transform hover:after:scale-x-100">{l.label}</a>)}
            {pages.map((l) => <NavLink key={l.to} to={l.to} className={({ isActive }) => `relative py-1 after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-full after:origin-left after:bg-petrol-400 after:transition-transform ${isActive ? "text-white after:scale-x-100" : "hover:text-white after:scale-x-0 hover:after:scale-x-100"}`}>{l.label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-2">
            <NavLink to="/raise" aria-label="Raise a Complaint" className="cta h-10 px-4 max-sm:px-3 inline-flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] bg-petrol-500 text-white text-[15px] font-semibold hover:bg-petrol-600">
              <MessageSquarePlus className="size-4" aria-hidden /><span className="max-sm:hidden">Raise a Complaint</span><span className="sm:hidden">Raise complaint</span>
            </NavLink>
            <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="lg:hidden size-10 grid place-items-center text-white">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {open && (
          <nav aria-label="Mobile" className="lg:hidden border-t border-white/10 px-5 py-3 flex flex-col">
            {links.map((l) => <a key={l.to} href={l.to} onClick={() => setOpen(false)} className="h-12 flex items-center text-[16px] font-semibold text-graphite-100">{l.label}</a>)}
            {pages.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="h-12 flex items-center text-[16px] font-semibold text-graphite-100">{l.label}</Link>)}
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-graphite-950 text-graphite-400 text-[14.5px] leading-6">
        <div className="max-w-[1200px] mx-auto px-5 py-12 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo inverse />
            <p className="mt-3 max-w-sm">Complaint registration and AI-assisted analysis for ABT CPD. Every insight shows where it came from: recorded fact, rule, or model output.</p>
          </div>
          <div>
            <div className="overline text-graphite-500 mb-3">Complaints</div>
            <ul className="space-y-2"><li><Link to="/raise" className="hover:text-white">Raise a complaint</Link></li><li><Link to="/track" className="hover:text-white">Track a complaint</Link></li><li><Link to="/register" className="hover:text-white">Complaint register</Link></li></ul>
          </div>
          <div>
            <div className="overline text-graphite-500 mb-3">Platform</div>
            <ul className="space-y-2"><li><a href="/#modules" className="hover:text-white">Modules</a></li><li><a href="/#how" className="hover:text-white">How it works</a></li><li><a href="/#features" className="hover:text-white">Features</a></li><li><a href="/#ai" className="hover:text-white">How we treat AI output</a></li><li><a href="/#faq" className="hover:text-white">FAQ</a></li></ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-[1200px] mx-auto px-5 py-4 flex flex-wrap justify-between gap-2 text-[12px]">
            <span>© {new Date().getFullYear()} CauseLine · ABT CPD</span>
            <span>Historical records in the register are synthetic demonstration data.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

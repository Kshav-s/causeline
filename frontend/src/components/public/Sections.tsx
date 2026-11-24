import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BrainCircuit, Check, Database, FlaskConical, Info, MessageSquarePlus, Package, Search, ShieldAlert, Table2, Truck } from "lucide-react";
import { api } from "../../services/api";
import { cx, fmtInt } from "../../utils/format";
import { useCycle, useStepsOnView } from "../../hooks/useMotion";
import { Logo } from "../domain/Logo";
import { delay, Eyebrow, SectionTitle } from "./bits";

type Meta = { models: Record<string, string>; max_images: number; max_image_mb: number; image_types: string[] };
type Summary = { total: number; synthetic: number; public_submissions: number; uncategorised: number; basis: string;
  categories: { category: string; complaints: number; critical: number; not_closed: number; subcategory_count: number; subcategories: { name: string; complaints: number }[] }[] };

export const useMeta = () => useQuery({ queryKey: ["public-meta"], staleTime: 300_000, queryFn: () => api.get<Meta>("/api/public/meta") });
export const useSummary = () => useQuery({ queryKey: ["public-register-summary"], staleTime: 60_000, queryFn: () => api.get<Summary>("/api/public/register/summary") });

/* ------------------------------------------------------------------ Why CauseLine */
const WHY = [
  { t: "Saved first, analysed second", d: "Every complaint is stored with a reference number before any model runs. If an analysis fails, nothing is lost and it can be retried.", n: "Reference and private access key, instantly" },
  { t: "Predictions never pass as facts", d: "Each value says where it came from: recorded, rule, NLP, model, similarity or human-verified. Uncertainty is shown, not hidden.", n: "A source label on every value" },
  { t: "Closed is not the same as effective", d: "CAPA effectiveness comes from complaints that came back after the action, linked by identifier - not from a status field.", n: "Recurrence linked by CAPA ID" },
  { t: "Patterns surface by rule", d: "Recurring and emerging product-defect hotspots are flagged by published rules, before a customer has to escalate.", n: "The rule is stated next to every result" },
];

export function WhyCauseLine() {
  const s = useSummary();
  return (
    <section className="bg-surface py-28 max-md:py-20">
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="reveal max-w-2xl">
          <Eyebrow>Why CauseLine</Eyebrow>
          <SectionTitle>Spreadsheets record complaints. CauseLine shows whether the fix worked.</SectionTitle>
          <p className="mt-4 text-[17px] leading-7 text-ink-2">Built around the ABT CPD complaint data and the models supplied with it, and shaped by one rule: show the evidence, and say where it came from.</p>
        </div>
        <div className="mt-12 grid md:grid-cols-2 border border-line rounded-xl overflow-hidden bg-surface">
          {WHY.map((w, i) => (
            <div key={w.t} className={cx("reveal group p-9 max-md:p-6 border-line transition-colors hover:bg-primary-tint", i % 2 === 0 && "md:border-r", i < 2 && "border-b", i === 2 && "max-md:border-b")} style={delay(i * 90)}>
              <div className="outline-num text-[64px] leading-none font-bold tracking-[-0.04em] transition-transform duration-500 group-hover:-translate-y-1" aria-hidden>0{i + 1}</div>
              <h3 className="mt-6 text-[20px] leading-7 font-bold text-ink">{w.t}</h3>
              <p className="mt-2.5 text-[15.5px] leading-[26px] text-ink-2">{w.d}</p>
              <p className="mt-5 font-mono text-[12.5px] text-muted"><span className="text-link">—</span> {w.n}</p>
            </div>
          ))}
        </div>
        <div className="reveal mt-6 rounded-xl border border-line bg-[linear-gradient(90deg,var(--primary-tint),transparent_70%)] px-6 py-5 flex items-center gap-4 max-sm:flex-col max-sm:items-start">
          <span className="shrink-0"><Logo compact /></span>
          <p className="text-[15px] leading-6 text-ink-2">
            <b className="text-ink">Built on the ABT CPD dataset.</b>{" "}
            {s.data ? <>The register holds {fmtInt(s.data.total)} complaints; {fmtInt(s.data.synthetic)} are synthetic historical records used for demonstration, and every screen says so.</>
              : <>Historical records in the register are synthetic demonstration data, and every screen says so.</>}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Complaint journey 1-5 */
const JOURNEY = [
  { t: "Raise", d: "Describe the problem in four short steps and add photos. No account needed." },
  { t: "Reference & key", d: "The complaint is saved first. You receive a reference number and a private access key." },
  { t: "AI analysis", d: "NLP suggests a category and finds similar past complaints, labelled as suggestions." },
  { t: "Quality review", d: "The quality team confirms or corrects the category and investigates the cause." },
  { t: "Track & close", d: "Follow each step on your timeline until the complaint is closed." },
];

export function Journey() {
  const { ref, active, select } = useStepsOnView(5, 480);
  const pct = (active / (JOURNEY.length - 1)) * 100;
  return (
    <section className="relative bg-primary-tint py-28 max-md:py-20 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(14,134,168,0.12),transparent)]" aria-hidden />
      <div ref={ref} className="relative max-w-[1200px] mx-auto px-5">
        <div className="reveal text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-md border border-petrol-400/50 bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-ink"><span className="font-mono text-link">01</span> Complaint journey</span>
          <SectionTitle className="mt-4">From complaint to closure, recorded as you go</SectionTitle>
          <p className="mt-4 text-[17px] leading-7 text-ink-2">Each step creates its own record. The complaint history is complete when it closes.</p>
        </div>
        {/* desktop: horizontal track */}
        <div className="reveal mt-14 max-md:hidden">
          <div className="relative mx-[10%] h-11">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] flow-dash text-petrol-400/40" aria-hidden />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-petrol-500 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} aria-hidden />
            {JOURNEY.map((j, i) => (
              <button key={j.t} type="button" onClick={() => select(i)} aria-label={`Step ${i + 1}: ${j.t}`} aria-current={i === active ? "step" : undefined}
                className={cx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-11 rounded-full grid place-items-center font-mono text-[14px] font-semibold border-2 transition-all duration-300",
                  i === active ? "bg-graphite-900 border-graphite-900 text-white scale-110 shadow-[0_0_0_6px_rgba(14,134,168,0.18)]" : i < active ? "bg-petrol-500 border-petrol-500 text-white" : "bg-surface border-petrol-400/60 text-ink-2")}
                style={{ left: `${(i / (JOURNEY.length - 1)) * 100}%` }}>
                {i < active ? <Check className="size-4" /> : i + 1}
              </button>
            ))}
          </div>
          <ol className="mt-6 grid grid-cols-5 gap-4">
            {JOURNEY.map((j, i) => (
              <li key={j.t}>
                <button type="button" onClick={() => select(i)} className={cx("w-full h-full text-center rounded-xl border bg-surface px-4 py-5 transition-all duration-300",
                  i === active ? "border-petrol-500 shadow-[0_16px_40px_-18px_rgba(14,134,168,0.6)] -translate-y-1.5" : "border-line shadow-[0_8px_24px_-18px_rgba(11,17,23,0.3)]")}>
                  <span className="block text-[16px] font-bold text-ink">{j.t}</span>
                  <span className="block mt-2 text-[14px] leading-[22px] text-ink-2">{j.d}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        {/* mobile: vertical track */}
        <ol className="md:hidden mt-10 relative pl-12">
          <span className="absolute left-[19px] top-2 bottom-2 w-[2px] bg-petrol-400/30" aria-hidden />
          {JOURNEY.map((j, i) => (
            <li key={j.t} className="relative pb-6 last:pb-0">
              <span className={cx("absolute -left-12 top-0 size-10 rounded-full grid place-items-center font-mono text-[14px] font-semibold border-2 transition-colors duration-500",
                i === active ? "bg-graphite-900 border-graphite-900 text-white" : i < active ? "bg-petrol-500 border-petrol-500 text-white" : "bg-surface border-petrol-400/60 text-ink-2")}>{i + 1}</span>
              <div className={cx("rounded-xl border bg-surface p-4 transition-colors duration-500", i === active ? "border-petrol-500" : "border-line")}>
                <div className="text-[16px] font-bold text-ink">{j.t}</div>
                <p className="mt-1 text-[14.5px] leading-[22px] text-ink-2">{j.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <ul className="reveal mt-10 flex flex-wrap justify-center gap-2.5" aria-label="Safeguards">
          {["Repeat submissions blocked", "Photo location data removed", "No account needed"].map((c) => (
            <li key={c} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13.5px] text-ink-2"><Check className="size-3.5 text-link" />{c}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Platform: six modules + engineering */
const MODULES = [
  { step: "Record", name: "Complaint register", text: "One searchable register of every complaint, with the source file and row kept for each record. Every edit is logged with who, when and why." },
  { step: "Classify", name: "AI complaint analysis", text: "NLP category and defect-subcategory shortlist plus similar historical complaints, with the model version and its limits." },
  { step: "Investigate", name: "Root-cause intelligence", text: "Recorded causes kept apart from model hypotheses and human-confirmed causes, with the historical evidence behind each." },
  { step: "Correct", name: "CAPA effectiveness", text: "Later complaints linked to a CAPA show whether the problem came back. Closed CAPAs that keep recurring are flagged as zombies." },
  { step: "Monitor", name: "Product & batch risk", text: "Product trend monitoring, batches with repeat complaints, and model risk tiers published with their weak test performance." },
  { step: "Report", name: "Analytics & reports", text: "Severity-weighted Pareto, recurrence hotspots, a zero-complaint path estimate and print-ready reports from stored records." },
];

const MODEL_NAMES: Record<string, string> = {
  "nlp-category": "NLP category", "nlp-subcategory": "Defect subcategory", "nlp-similarity": "Similar cases", "food-safety-flag": "Food-safety rules",
  "root-cause": "Root cause", "batch-risk": "Batch risk",
};

const ENGINEERING = [
  ["Provenance", "Every value carries a source label - recorded, rule, NLP, model, similarity, human-verified or insufficient data. Machine output is outlined dashed."],
  ["Privacy", "Photos are re-encoded with location and camera metadata removed. Access keys are stored only as SHA-256 hashes. The public register shows no names or descriptions."],
  ["Integrity", "One-time submission tokens block duplicates, reference numbers are never reused, and every change is written to the audit log."],
  ["Verification", "Automated backend, browser and preprocessing-parity tests. Dashboard figures are re-checked against direct database queries."],
];

export function Platform() {
  const { ref, active, select } = useCycle(6, 2400);
  const meta = useMeta();
  return (
    <section id="modules" className="bg-surface py-24 max-md:py-12 scroll-mt-16">
      <div className="max-w-[1240px] mx-auto px-5 max-md:px-3">
        <div ref={ref} className="reveal relative rounded-2xl bg-graphite-950 grid-texture text-white overflow-hidden px-12 py-14 max-lg:px-7 max-md:px-5 max-md:py-10">
          <div className="absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(14,134,168,0.22),transparent_65%)]" aria-hidden />
          <div className="relative grid gap-6 lg:grid-cols-[1.1fr_1fr] items-end">
            <div>
              <span className="inline-flex items-center gap-2 rounded-md border border-petrol-400/40 bg-petrol-500/10 px-2.5 py-1 text-[12.5px] font-semibold"><span className="font-mono text-petrol-400">02</span> The platform</span>
              <h2 className="mt-4 text-[42px] leading-[50px] max-md:text-[31px] max-md:leading-[39px] font-bold tracking-[-0.022em]">Six modules, one evidence trail</h2>
            </div>
            <p className="text-[16.5px] leading-7 text-graphite-300 lg:pb-1.5">Every module writes to the same records, so the evidence links from the first report to the verified fix. Nothing is copied between systems.</p>
          </div>

          {/* pipeline */}
          <ol className="relative mt-12 grid grid-cols-6 max-lg:grid-cols-3 gap-x-3 gap-y-5" aria-label="Evidence trail">
            {MODULES.map((m, i) => (
              <li key={m.step} className="relative">
                <div className="text-center font-mono text-[11px] text-graphite-500 mb-2">0{i + 1}</div>
                <button type="button" onClick={() => select(i)} aria-current={i === active ? "step" : undefined}
                  className={cx("relative w-full h-11 rounded-md border font-mono text-[13px] font-medium transition-all duration-500",
                    i === active ? "border-petrol-400 bg-petrol-500/20 text-white shadow-[0_0_24px_-4px_rgba(58,165,196,0.6)]" : i < active ? "border-white/25 text-graphite-200" : "border-white/15 text-graphite-400 hover:border-white/30")}>
                  {m.step}
                </button>
                {i < MODULES.length - 1 && <span className={cx("absolute top-[calc(50%+12px)] -right-3 w-3 h-px max-lg:hidden", i < active ? "bg-petrol-400" : "bg-white/15")} aria-hidden />}
              </li>
            ))}
          </ol>
          <div className="mt-3 h-px w-full shimmer-line opacity-60 max-lg:hidden" aria-hidden />

          {/* module cards */}
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <article key={m.name} onMouseEnter={() => select(i)} onFocus={() => select(i)} tabIndex={0}
                className={cx("rounded-xl border p-5 transition-all duration-500 outline-none", i === active ? "border-petrol-400/70 bg-white/[0.07] -translate-y-1" : "border-white/12 bg-white/[0.02] hover:border-white/25")}>
                <h3 className="flex items-center gap-2.5 text-[17px] font-bold">
                  <span className={cx("size-2.5 rotate-45 border-2 transition-colors", i === active ? "border-petrol-400 bg-petrol-400" : "border-graphite-400")} aria-hidden />{m.name}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-[23px] text-graphite-300">{m.text}</p>
              </article>
            ))}
          </div>

          {/* engineering */}
          <div className="mt-14">
            <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-petrol-400">Design &amp; engineering under the hood</p>
            <dl className="mt-4 divide-y divide-white/10 border-y border-white/10">
              <div className="grid gap-2 md:grid-cols-[170px_1fr] py-4">
                <dt className="font-mono text-[12.5px] font-semibold uppercase tracking-wide text-white">Models</dt>
                <dd className="text-[15px] leading-6 text-graphite-300">
                  Registered models load once inside the backend; each prediction stores its model version and is never overwritten. Nothing is sent to an outside AI service.
                  <span className="mt-3 flex flex-wrap gap-2" aria-label="Live model status">
                    {meta.data ? Object.entries(meta.data.models).map(([k, st]) => (
                      <span key={k} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px]", st === "ready" ? "border-[#2f6b49] text-[#9fe0b9]" : "border-[#7a5a20] text-[#f2c66d]")}>
                        <span className={cx("size-1.5 rounded-full", st === "ready" ? "bg-[#6fcf97]" : "bg-[#f2c66d]")} />{MODEL_NAMES[k] ?? k} · {st}
                      </span>
                    )) : <span className="text-[12.5px] text-graphite-500">Loading live model status…</span>}
                  </span>
                </dd>
              </div>
              {ENGINEERING.map(([k, v]) => (
                <div key={k} className="grid gap-2 md:grid-cols-[170px_1fr] py-4">
                  <dt className="font-mono text-[12.5px] font-semibold uppercase tracking-wide text-white">{k}</dt>
                  <dd className="text-[15px] leading-6 text-graphite-300">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Product screenshots */
/** Real screenshots of the running application (frontend/public/product). Replace the files to update; a missing file hides its tab. */
const SHOTS = [
  { src: "/product/register.png", t: "Complaint register", d: "The public, anonymised register: search, filter by category, severity and status, and open your own complaints." },
  { src: "/product/analysis.png", t: "AI analysis result", d: "A complaint's evidence summary: recorded facts, NLP suggestion, similar cases and human-verified findings, each labelled." },
  { src: "/product/dashboard.png", t: "Quality dashboard", d: "Staff overview: KPIs, monthly trend, category Pareto and the items that need attention - all computed from stored records." },
  { src: "/product/zombie-capa.png", t: "Zombie CAPA detector", d: "Closed CAPAs followed by identifier-linked recurrences, with the earlier investigations behind them." },
  { src: "/product/simulator.png", t: "Zero complaint path", d: "Estimate of how far CAPAs on each recorded root cause could reduce complaints - labelled as an estimate." },
];

export function ProductTour() {
  const [failed, setFailed] = useState<string[]>([]);
  const shots = useMemo(() => SHOTS.filter((s) => !failed.includes(s.src)), [failed]);
  const { ref, active, select } = useCycle(Math.max(shots.length, 1), 5200, 15000);
  if (!shots.length) return null;
  const cur = shots[active % shots.length];
  return (
    <section id="tour" className="bg-canvas py-28 max-md:py-20 scroll-mt-16">
      <div ref={ref} className="max-w-[1200px] mx-auto px-5">
        <div className="reveal grid gap-6 lg:grid-cols-[1.1fr_1fr] items-end">
          <div><Eyebrow>See it working</Eyebrow><SectionTitle>The real product, not a mock‑up</SectionTitle></div>
          <p className="text-[16.5px] leading-7 text-ink-2 lg:pb-1.5">Screenshots of the running application. The figures in them come from the synthetic ABT CPD demonstration data.</p>
        </div>
        <div className="reveal mt-12 grid gap-6 lg:grid-cols-[300px_1fr] items-start" style={delay(100)}>
          <div role="tablist" aria-label="Screenshots" className="flex lg:flex-col gap-2 overflow-x-auto max-lg:-mx-5 max-lg:px-5 pb-1">
            {shots.map((s, i) => (
              <button key={s.src} role="tab" aria-selected={i === active % shots.length} onClick={() => select(i)}
                className={cx("relative shrink-0 text-left rounded-lg border px-4 py-3 transition-colors overflow-hidden max-lg:min-w-56",
                  i === active % shots.length ? "border-petrol-500 bg-surface shadow-[0_10px_30px_-18px_rgba(14,134,168,0.7)]" : "border-line bg-surface/60 hover:bg-surface")}>
                <span className="block text-[15px] font-bold text-ink">{s.t}</span>
                <span className="block mt-1 text-[13.5px] leading-5 text-muted max-lg:line-clamp-2">{s.d}</span>
                {i === active % shots.length && <span className="absolute left-0 bottom-0 h-[2px] w-full shimmer-line" aria-hidden />}
              </button>
            ))}
          </div>
          <figure className="rounded-xl border border-line bg-graphite-900 shadow-[0_30px_70px_-30px_rgba(11,17,23,0.55)] overflow-hidden">
            <div className="h-9 flex items-center gap-1.5 px-3 border-b border-white/10">
              <span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" />
              <span className="ml-3 text-[11.5px] text-graphite-400 font-mono truncate">causeline · {cur.t.toLowerCase()}</span>
            </div>
            <div className="relative aspect-[16/10] bg-canvas">
              {shots.map((s, i) => (
                <img key={s.src} src={s.src} alt={`Screenshot: ${s.t}`} loading="lazy" onError={() => setFailed((f) => [...f, s.src])}
                  className={cx("absolute inset-0 size-full object-cover object-top transition-all duration-700", i === active % shots.length ? "opacity-100 scale-100" : "opacity-0 scale-[1.02]")} />
              ))}
            </div>
            <figcaption className="px-4 py-2.5 text-[12.5px] text-graphite-400 border-t border-white/10 flex items-center gap-2"><Info className="size-3.5 shrink-0" />Real screenshot · synthetic demonstration data</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Complaint register (live counts) */
const GROUPS = [
  { name: "Food safety", icon: ShieldAlert, cats: ["Contamination / microbiological", "Physical defect / foreign matter", "Infestation / pest", "Labelling / allergen issue"] },
  { name: "Product quality", icon: FlaskConical, cats: ["Product quality deviation", "Sensory characteristic", "Process-related defect"] },
  { name: "Packaging & quantity", icon: Package, cats: ["Packaging issue", "Weight / quantity issue"] },
  { name: "Storage & transport", icon: Truck, cats: ["Storage / transportation issue"] },
];

export function RegisterSection() {
  const s = useSummary();
  const byCat = new Map((s.data?.categories ?? []).map((c) => [c.category, c]));
  const known = new Set(GROUPS.flatMap((g) => g.cats));
  const other = (s.data?.categories ?? []).filter((c) => !known.has(c.category)).map((c) => c.category);
  const groups = other.length ? [...GROUPS, { name: "Other", icon: Database, cats: other }] : GROUPS;
  const max = Math.max(1, ...(s.data?.categories ?? []).map((c) => c.complaints));
  return (
    <section id="register" className="bg-surface py-28 max-md:py-20 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="reveal grid gap-6 lg:grid-cols-[1.1fr_1fr] items-end">
          <div><Eyebrow>Complaint register</Eyebrow><SectionTitle>Every complaint, grouped by what went wrong</SectionTitle></div>
          <p className="text-[16.5px] leading-7 text-ink-2 lg:pb-1.5">
            {s.data ? <>{fmtInt(s.data.total)} complaints across {s.data.categories.length} recorded categories. </> : null}
            Pick a category to open the register filtered to it - search, sort and page through every record.
          </p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {groups.map((g, gi) => {
            const cats = g.cats.map((c) => byCat.get(c)).filter((c): c is NonNullable<typeof c> => !!c);
            const total = cats.reduce((a, c) => a + c.complaints, 0);
            return (
              <div key={g.name} className={cx("reveal rounded-xl border border-line bg-surface shadow-[0_10px_30px_-24px_rgba(11,17,23,0.35)] overflow-hidden", gi === 0 && "lg:row-span-2", gi === 3 && "lg:col-span-2")} style={delay(gi * 80)}>
                <div className="flex items-center gap-3 px-5 h-14 border-b border-line">
                  <span className="size-8 grid place-items-center rounded-md bg-primary-tint text-link"><g.icon className="size-4" aria-hidden /></span>
                  <h3 className="text-[16px] font-bold text-ink">{g.name}</h3>
                  <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[12px] font-mono text-muted" title="Complaints in this group">{s.data ? fmtInt(total) : "…"}</span>
                </div>
                <ul className={cx("p-2", gi === 3 && "lg:grid lg:grid-cols-2")}>
                  {s.isLoading && g.cats.map((c) => <li key={c} className="h-16 m-1 rounded-lg bg-surface-2 animate-pulse" />)}
                  {s.isError && gi === 0 && <li className="p-3 text-[14px] text-muted">The register summary could not be loaded.</li>}
                  {cats.map((c) => (
                    <li key={c.category}>
                      <Link to={`/register?category=${encodeURIComponent(c.category)}`} className="group flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-2 transition-colors">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2"><span className="text-[15px] font-semibold text-ink truncate">{c.category}</span>
                            {c.critical > 0 && <span className="shrink-0 rounded-full px-1.5 text-[11px] font-medium text-[var(--bad-fg)] bg-[var(--bad-bg)]">{fmtInt(c.critical)} critical</span>}</span>
                          <span className="block text-[13px] text-muted truncate">{c.subcategories.map((x) => x.name).slice(0, 2).join(" · ")}{c.subcategory_count > 2 ? ` +${c.subcategory_count - 2} more` : ""}</span>
                          <span className="mt-1.5 block h-1 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-petrol-500/80 transition-[width] duration-1000" style={{ width: `${(c.complaints / max) * 100}%` }} /></span>
                        </span>
                        <span className="text-[14px] font-mono font-semibold text-ink num">{fmtInt(c.complaints)}</span>
                        <ArrowRight className="size-4 text-faint transition-transform group-hover:translate-x-1 group-hover:text-link" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="reveal mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13.5px] text-muted flex items-center gap-2"><Database className="size-4 shrink-0" />Counts come straight from the register database. Grouping is for display only. Historical records are synthetic demonstration data.</p>
          <Link to="/register" className="cta h-11 px-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-graphite-900 text-white text-[15px] font-semibold hover:bg-graphite-800">Open the complaint register <ArrowRight className="cta-arrow size-4" /></Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Features (what a visitor can do) */
export function Features() {
  const meta = useMeta();
  const m = meta.data;
  const FEATURES = [
    { icon: MessageSquarePlus, t: "Raise", d: "Report a problem with a product in a few minutes.", to: "/raise", cta: "Raise a complaint",
      items: ["Four short steps with a review screen", m ? `Up to ${m.max_images} photos, ${m.max_image_mb} MB each (${m.image_types.filter((x) => x !== "JPEG").join(", ")})` : "Photos as supporting evidence", "Saved before any analysis runs", "Repeat submissions blocked"] },
    { icon: Search, t: "Track", d: "Follow your complaint with the details only you hold.", to: "/track", cta: "Track a complaint",
      items: ["Reference number and private access key", "Timeline of every step", "Current status and analysis result", "No staff names or internal notes shown"] },
    { icon: BrainCircuit, t: "Understand", d: "See what the AI suggested - and how sure it is.", to: "/#ai", cta: "How we treat AI",
      items: ["Category suggestion with its uncertainty", "Similar past complaints as evidence", "Food-safety rule alert", "Model version and known limits"] },
    { icon: Table2, t: "Browse", d: "Look through the register without seeing anyone's details.", to: "/register", cta: "Open the register",
      items: ["Anonymised complaint register", "Search, filter, sort and page", "No names, emails or descriptions", "Historical records marked as demo data"] },
  ];
  return (
    <section id="features" className="bg-canvas py-28 max-md:py-20 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="reveal max-w-2xl">
          <Eyebrow>Features</Eyebrow>
          <SectionTitle>Everything you need to raise and follow a complaint</SectionTitle>
          <p className="mt-4 text-[17px] leading-7 text-ink-2">Four things you can do here without an account. The quality team works on the same records behind a staff sign-in.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <article key={f.t} className="reveal group flex flex-col rounded-xl border border-line bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-petrol-400 hover:shadow-[0_20px_40px_-24px_rgba(14,134,168,0.55)]" style={delay(i * 80)}>
              <div className="flex items-center justify-between">
                <span className="size-10 grid place-items-center rounded-lg bg-primary-tint text-link transition-colors group-hover:bg-petrol-500 group-hover:text-white"><f.icon className="size-5" aria-hidden /></span>
                <span className="font-mono text-[12px] text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-[20px] font-bold text-ink">{f.t}</h3>
              <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{f.d}</p>
              <ul className="mt-4 space-y-2 text-[14px] leading-[21px] text-ink-2 flex-1">
                {f.items.map((x) => <li key={x} className="flex gap-2"><Check className="size-4 mt-0.5 shrink-0 text-link" />{x}</li>)}
              </ul>
              {f.to.startsWith("/#") ? <a href={f.to} className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-link">{f.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></a>
                : <Link to={f.to} className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-link">{f.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BrainCircuit, ChevronDown, ClipboardList, Database, FileBarChart2, GitBranch, LineChart, ListChecks, ShieldAlert, Upload, X, Check } from "lucide-react";
import { ProvenanceBadge, PROVENANCE_LEGEND } from "../../components/ui/ProvenanceBadge";
import { cx } from "../../utils/format";

const MODULES = [
  { icon: ClipboardList, name: "Complaint register", text: "One searchable register of every complaint, with source file and row kept for each record.",
    bullets: ["Filter by date, product, category, severity and status", "Open / investigating / closed counts at a glance", "Every edit logged with who, when and why"] },
  { icon: BrainCircuit, name: "AI complaint analysis", text: "NLP classification and similar-case retrieval, shown as a ranked shortlist with the model version and its limits.",
    bullets: ["Category and defect subcategory shortlist", "Similar historical complaints as evidence", "Confirm, correct or reject - stored as human-verified"] },
  { icon: GitBranch, name: "Root cause intelligence", text: "Recorded root causes kept apart from model hypotheses, with the historical evidence behind each.",
    bullets: ["Recorded vs predicted vs human-confirmed", "Pareto of confirmed and probable causes", "Hypotheses only when the category is known"] },
  { icon: ListChecks, name: "CAPA effectiveness", text: "A closed CAPA is not assumed effective. Later complaints linked to the CAPA show whether the problem came back.",
    bullets: ["Recurrences linked by CAPA identifier", "Ineffective rate with confidence intervals", "Clear 'cannot be established' state"] },
  { icon: ShieldAlert, name: "Product & batch risk", text: "Batch-level risk tiers from the supplied model, published with its weak test performance so tiers are used for prioritising only.",
    bullets: ["Low / Medium / High tiers with factors", "Product-level trend monitoring", "Level of estimation always stated"] },
  { icon: LineChart, name: "Analytics & reports", text: "Trends, Pareto, recurrence hotspots and print-ready reports computed from stored records.",
    bullets: ["Severity-weighted Pareto", "Recurring and emerging product-defect hotspots", "Reports stamped with filters and snapshot time"] },
];

const FAQ = [
  ["Is the data in the demo real?", "No. The demonstration environment uses the synthetic ABT CPD dataset supplied with the project. Every screen marks it as demo data, and no figure should be read as real company performance."],
  ["Does the AI decide the root cause?", "No. Model outputs are labelled as predictions or possible explanations. Only a person can confirm a category or a root cause, and that confirmation is stored separately with their name."],
  ["How reliable are the predictions?", "Each model publishes its evaluation and limits inside the product. For example, the complaint classifier was trained on templated synthetic text and is uncertain on free-form wording, and the batch-risk model has weak predictive signal. The interface shows that uncertainty rather than hiding it."],
  ["Do I need an account to raise a complaint?", "No. Anyone can raise a complaint and attach photos. You receive a reference number and a private access key; keep both to view your complaint and its analysis later. Other visitors cannot see your details."],
  ["Does the AI look at my photos?", "No. Photos are stored as supporting evidence for the quality team. The AI analyses the written description only."],
  ["Is complaint data sent to outside AI services?", "No. All models run inside the CauseLine backend. Nothing is sent to an external AI provider."],
];

function Mockup() {
  return (
    <div className="relative rounded-xl border border-white/10 bg-graphite-900 shadow-2xl overflow-hidden" aria-label="Illustrative product preview with placeholder values">
      <div className="h-8 flex items-center gap-1.5 px-3 border-b border-white/10">
        <span className="size-2 rounded-full bg-white/20" /><span className="size-2 rounded-full bg-white/20" /><span className="size-2 rounded-full bg-white/20" />
        <span className="ml-3 text-[10px] text-graphite-400 font-mono">causeline / complaint analysis</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-graphite-400 border border-white/15 rounded px-1.5">Illustrative</span>
      </div>
      <div className="p-4 grid gap-3 text-[12px]">
        <div className="rounded-lg bg-white/[0.04] border border-white/10 p-3">
          <div className="text-graphite-400 mb-1">Submitted text</div>
          <div className="text-graphite-200">"Hard fragment found inside a sealed retail pack…"</div>
        </div>
        <div className="rounded-lg border-2 border-dashed p-3" style={{ borderColor: "#6a55c0" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Complaint category</span>
            <span className="text-[10px] px-1.5 rounded-full border border-dashed" style={{ color: "#d3b0e8", borderColor: "#7f4ea4" }}>NLP classification</span>
          </div>
          {[["Physical defect / foreign matter", 62], ["Packaging issue", 21], ["Process-related defect", 9]].map(([l, v]) => (
            <div key={l as string} className="mb-1.5">
              <div className="flex justify-between text-graphite-300"><span>{l}</span><span className="font-mono">0.{String(v).padStart(2, "0")}</span></div>
              <div className="h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: `${v}%`, background: "#b9a9f0" }} /></div>
            </div>
          ))}
          <div className="mt-2 flex gap-1.5"><span className="px-2 py-0.5 rounded border border-white/20 text-graphite-200">Confirm</span><span className="px-2 py-0.5 rounded border border-white/20 text-graphite-200">Correct…</span></div>
        </div>
        <div className="rounded-lg border border-white/10 p-3 flex items-center justify-between">
          <span className="text-graphite-300">Food-safety review</span><span className="text-[10px] px-1.5 rounded-full" style={{ color: "#f19a93", background: "rgba(180,47,40,.2)" }}>Escalate · rule-based</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [active, setActive] = useState(0);
  const [faq, setFaq] = useState<number | null>(0);
  const M = MODULES[active];
  return (
    <>
      {/* Hero */}
      <section className="relative bg-graphite-950 grid-texture text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(14,134,168,0.22),transparent)]" aria-hidden />
        <div className="relative max-w-[1200px] mx-auto px-5 pt-32 pb-20 max-md:pt-28 max-md:pb-14 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] text-graphite-300">Complaint analytics for food quality teams</span>
            <h1 className="mt-5 text-[44px] leading-[52px] max-md:text-[34px] max-md:leading-[42px] font-bold tracking-[-0.02em]">
              Trace every complaint<br />to its cause - <span className="text-petrol-400">and prove<br className="max-sm:hidden" /> the fix held.</span>
            </h1>
            <p className="mt-5 text-[16px] leading-6 text-graphite-300 max-w-xl">
              CauseLine brings complaint records, NLP classification, root-cause evidence and CAPA follow-up into one place, and labels every insight as recorded fact, rule or model output.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/raise" className="h-11 px-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-petrol-500 hover:bg-petrol-600 font-medium">Raise a Complaint <ArrowRight className="size-4" /></Link>
              <Link to="/register" className="h-11 px-5 inline-flex items-center rounded-[var(--radius-control)] border border-white/20 hover:bg-white/10 font-medium">View complaint register</Link>
            </div>
          </div>
          <Mockup />
        </div>
        <div className="relative border-t border-white/10">
          <ul className="max-w-[1200px] mx-auto px-5 py-5 flex flex-wrap justify-center gap-2 text-[12px] text-graphite-300" aria-label="Capabilities">
            {["Complaint analytics", "NLP classification", "Similar cases", "Root-cause evidence", "CAPA effectiveness", "Pareto analysis", "Batch risk tiers", "Audit trail"].map((c) => (
              <li key={c} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">{c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Before / with */}
      <section className="bg-canvas py-24 max-md:py-16">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-link">Why teams move</p>
          <h2 className="mt-2 text-[32px] leading-10 max-md:text-[26px] max-md:leading-8 font-semibold tracking-[-0.01em] max-w-2xl">Spreadsheets record complaints. They rarely show whether the fix worked.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h3 className="font-semibold">With scattered files</h3>
              <ul className="mt-4 space-y-3 text-[14px] text-ink-2">
                {["Complaints, investigations and CAPAs live in separate sheets", "Root causes are guessed and never marked as unconfirmed", "A closed CAPA is assumed effective", "Recurring defects surface only when a customer escalates"].map((t) => (
                  <li key={t} className="flex gap-2"><X className="size-4 mt-0.5 shrink-0 text-[var(--bad-fg)]" />{t}</li>))}
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] bg-graphite-900 text-white p-6">
              <h3 className="font-semibold">With CauseLine</h3>
              <ul className="mt-4 space-y-3 text-[14px] text-graphite-200">
                {["One register linked to batches, root causes and CAPAs by real identifiers", "Recorded, predicted and human-verified causes kept visibly apart", "Effectiveness judged from complaints that came back after the CAPA", "Recurring and emerging product-defect hotspots flagged by explicit rules"].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="size-4 mt-0.5 shrink-0 text-petrol-400" />{t}</li>))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-24 max-md:py-16 border-y border-line scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-link">How it works</p>
          <h2 className="mt-2 text-[32px] leading-10 max-md:text-[26px] font-semibold tracking-[-0.01em]">From a complaint file to a verified fix</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[[Upload, "Raise", "Describe the problem and attach photos. The complaint is saved and given a reference number immediately."],
              [BrainCircuit, "Analyse", "Classify complaint text and pull similar historical cases, with the model version recorded."],
              [GitBranch, "Investigate", "Compare recorded causes and model hypotheses. A person confirms the category and cause."],
              [ListChecks, "Verify the CAPA", "Watch for linked recurrences after the action. Effectiveness comes from evidence, not closure."]].map(([Icon, t, d], i) => {
              const I = Icon as typeof Upload;
              return (
                <li key={t as string} className="rounded-[var(--radius-card)] border border-line p-5 bg-canvas">
                  <div className="flex items-center justify-between"><I className="size-5 text-link" /><span className="font-mono text-[12px] text-faint">0{i + 1}</span></div>
                  <h3 className="mt-4 font-semibold">{t as string}</h3>
                  <p className="mt-1.5 text-[13px] text-muted">{d as string}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="bg-graphite-950 grid-texture text-white py-24 max-md:py-16 scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-petrol-400">The platform</p>
          <h2 className="mt-2 text-[32px] leading-10 max-md:text-[26px] font-semibold tracking-[-0.01em] max-w-2xl">Six modules, one evidence trail</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-[320px_1fr]">
            <div role="tablist" aria-label="Modules" className="flex flex-col gap-1.5 max-lg:hidden">
              {MODULES.map((m, i) => (
                <button key={m.name} role="tab" aria-selected={active === i} onClick={() => setActive(i)}
                  className={cx("flex items-center gap-3 text-left rounded-[var(--radius-card)] border px-4 h-14 text-[14px] font-medium transition-colors",
                    active === i ? "border-petrol-500/60 bg-petrol-500/10 text-white" : "border-white/10 text-graphite-300 hover:bg-white/5")}>
                  <m.icon className={cx("size-5", active === i ? "text-petrol-400" : "text-graphite-400")} />{m.name}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="max-lg:hidden rounded-xl border border-white/10 bg-white/[0.03] p-8">
              <div className="flex items-center gap-3"><M.icon className="size-6 text-petrol-400" /><h3 className="text-xl font-semibold">{M.name}</h3></div>
              <p className="mt-3 text-graphite-300 max-w-xl">{M.text}</p>
              <ul className="mt-6 space-y-2.5 text-graphite-200">{M.bullets.map((b) => <li key={b} className="flex gap-2"><Check className="size-4 mt-0.5 text-petrol-400 shrink-0" />{b}</li>)}</ul>
            </div>
            {/* accordion on smaller screens */}
            <div className="lg:hidden space-y-2">
              {MODULES.map((m, i) => (
                <div key={m.name} className="rounded-[var(--radius-card)] border border-white/10">
                  <button aria-expanded={active === i} onClick={() => setActive(active === i ? -1 : i)} className="w-full flex items-center gap-3 px-4 h-14 text-left font-medium">
                    <m.icon className="size-5 text-petrol-400" />{m.name}<ChevronDown className={cx("size-4 ml-auto transition-transform", active === i && "rotate-180")} />
                  </button>
                  {active === i && <div className="px-4 pb-4 text-[14px] text-graphite-300"><p>{m.text}</p><ul className="mt-3 space-y-1.5">{m.bullets.map((b) => <li key={b} className="flex gap-2"><Check className="size-4 mt-0.5 text-petrol-400 shrink-0" />{b}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI explainer */}
      <section id="ai" className="bg-canvas py-24 max-md:py-16 scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-5 grid gap-10 lg:grid-cols-2 items-start">
          <div>
            <p className="overline text-link">How we treat AI output</p>
            <h2 className="mt-2 text-[32px] leading-10 max-md:text-[26px] font-semibold tracking-[-0.01em]">A prediction is never shown as a fact</h2>
            <p className="mt-4 text-ink-2 max-w-xl">Every value in CauseLine carries a label for where it came from. Machine output uses a dashed outline; recorded and verified values are solid. Uncertainty, model version and known limits are shown next to each result.</p>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {PROVENANCE_LEGEND.map((k) => (
              <li key={k} className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
                <ProvenanceBadge kind={k} />
                <p className="text-[12px] text-muted mt-2">{{
                  recorded: "Taken directly from a source record.", rule: "Deterministic calculation with a published rule.", nlp: "Text classification by a registered NLP model.",
                  model: "Output of a registered ML model - a hypothesis.", similarity: "Retrieved because the wording is similar.", historical: "Pre-computed by the supplied ML package.",
                  human: "Confirmed or corrected by a named person.", insufficient: "Not enough data to answer - no guess is made.", demo: "Synthetic demonstration data.",
                }[k]}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-surface py-24 max-md:py-16 border-t border-line scroll-mt-16">
        <div className="max-w-[760px] mx-auto px-5">
          <h2 className="text-[32px] leading-10 max-md:text-[26px] font-semibold tracking-[-0.01em] text-center">Questions worth asking</h2>
          <div className="mt-8 space-y-2">
            {FAQ.map(([q, a], i) => (
              <div key={q} className="rounded-[var(--radius-card)] border border-line bg-canvas">
                <button aria-expanded={faq === i} onClick={() => setFaq(faq === i ? null : i)} className="w-full flex items-center justify-between gap-3 px-4 min-h-12 py-3 text-left font-medium">
                  {q}<ChevronDown className={cx("size-4 shrink-0 transition-transform", faq === i && "rotate-180")} />
                </button>
                {faq === i && <p className="px-4 pb-4 text-[14px] text-ink-2">{a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-graphite-900 grid-texture text-white py-20">
        <div className="max-w-[760px] mx-auto px-5 text-center">
          <h2 className="text-[32px] leading-10 max-md:text-[26px] font-semibold tracking-[-0.01em]">Found a problem with a product?</h2>
          <p className="mt-3 text-graphite-300">Raise a complaint in a few minutes - no account needed. Attach photos, get a reference number straight away, and see how our AI classifies it.</p>
          <div className="mt-7 flex justify-center flex-wrap gap-3">
            <Link to="/raise" className="h-11 px-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-petrol-500 hover:bg-petrol-600 font-medium">Raise a Complaint <ArrowRight className="size-4" /></Link>
            <Link to="/track" className="h-11 px-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-white/20 hover:bg-white/10 font-medium"><Database className="size-4" />Track a complaint</Link>
          </div>
          <p className="mt-4 text-[12px] text-graphite-500 flex items-center justify-center gap-1"><FileBarChart2 className="size-3.5" />No statistics on this page are about real customers.</p>
        </div>
      </section>
    </>
  );
}

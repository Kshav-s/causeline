import { useRef, type CSSProperties, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, BrainCircuit, GitBranch, Link2, ListChecks, ListOrdered, UserCheck } from "lucide-react";

const POINTS = [
  { icon: BarChart3, t: "Complaint analytics", d: "Trends, severity and recurrence from stored records" },
  { icon: BrainCircuit, t: "NLP classification", d: "Category shortlist with model version and limits" },
  { icon: Link2, t: "Similar cases", d: "Past complaints with the closest wording, as evidence" },
  { icon: GitBranch, t: "Root-cause evidence", d: "Recorded causes kept apart from hypotheses" },
  { icon: ListChecks, t: "CAPA effectiveness", d: "Judged by what came back, not by closure" },
  { icon: ListOrdered, t: "Pareto analysis", d: "The few causes behind most complaints" },
];

/** Illustrative preview with placeholder values (labelled). Tilts towards the pointer via CSS vars set on the hero. */
function Mockup() {
  return (
    <div className="relative float-idle">
      <div className="tilt">
        <div className="relative rounded-xl border border-white/10 bg-graphite-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] overflow-hidden" aria-label="Illustrative product preview with placeholder values">
          <div className="h-9 flex items-center gap-1.5 px-3 border-b border-white/10">
            <span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" />
            <span className="ml-3 text-[11px] text-graphite-400 font-mono">causeline / complaint analysis</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-graphite-400 border border-white/15 rounded px-1.5">Illustrative</span>
          </div>
          <div className="p-4 grid gap-3 text-[13px]">
            <div className="rounded-lg bg-white/[0.04] border border-white/10 p-3">
              <div className="text-graphite-400 mb-1 text-[12px]">Submitted text</div>
              <div className="text-graphite-200">"Hard fragment found inside a sealed retail pack…"</div>
            </div>
            <div className="rounded-lg border-2 border-dashed p-3" style={{ borderColor: "#6a55c0" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-semibold">Complaint category</span>
                <span className="text-[10px] px-1.5 rounded-full border border-dashed" style={{ color: "#d3b0e8", borderColor: "#7f4ea4" }}>NLP classification</span>
              </div>
              {[["Physical defect / foreign matter", 62], ["Packaging issue", 21], ["Process-related defect", 9]].map(([l, v]) => (
                <div key={l as string} className="mb-1.5">
                  <div className="flex justify-between text-graphite-300 text-[12px]"><span>{l}</span><span className="font-mono">0.{String(v).padStart(2, "0")}</span></div>
                  <div className="h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: `${v}%`, background: "#b9a9f0" }} /></div>
                </div>
              ))}
              <div className="mt-2 flex gap-1.5 text-[12px]"><span className="px-2 py-0.5 rounded border border-white/20 text-graphite-200">Confirm</span><span className="px-2 py-0.5 rounded border border-white/20 text-graphite-200">Correct…</span></div>
            </div>
            <div className="rounded-lg border border-white/10 p-3 flex items-center justify-between">
              <span className="text-graphite-300">Food-safety review</span><span className="text-[10px] px-1.5 rounded-full" style={{ color: "#f19a93", background: "rgba(180,47,40,.2)" }}>Escalate · rule-based</span>
            </div>
          </div>
        </div>
        {/* parallax chip: sits in front of the card and moves further than it */}
        <div className="tilt-layer absolute -left-6 -bottom-5 max-sm:left-2 rounded-lg border border-white/15 bg-graphite-800/95 backdrop-blur px-3 py-2 shadow-xl flex items-center gap-2 text-[12px]" aria-hidden>
          <UserCheck className="size-4 text-[#6fcf97]" /><span className="text-graphite-200">Human review</span><span className="text-graphite-400">· pending</span>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const set = (k: string, v: string) => ref.current?.style.setProperty(k, v);
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, nx = x / r.width - 0.5, ny = y / r.height - 0.5;
    set("--mx", `${x}px`); set("--my", `${y}px`); set("--spot", "1");
    set("--ry", `${(nx * 12).toFixed(2)}deg`); set("--rx", `${(-ny * 9).toFixed(2)}deg`);
    set("--tx", `${(nx * 14).toFixed(1)}px`); set("--ty", `${(ny * 10).toFixed(1)}px`);
  };
  const onLeave = () => { set("--spot", "0"); set("--rx", "0deg"); set("--ry", "0deg"); set("--tx", "0px"); set("--ty", "0px"); };
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
  return (
    <section ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}
      className="relative bg-graphite-950 grid-texture text-white overflow-hidden min-h-[100svh] flex flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(14,134,168,0.22),transparent)]" aria-hidden />
      <div className="grid-spot" aria-hidden />
      <div className="relative flex-1 flex items-center">
        <div className="w-full max-w-[1200px] mx-auto px-5 pt-24 pb-12 max-md:pt-24 max-md:pb-12 grid gap-14 lg:grid-cols-[1.05fr_1fr] items-center">
          <div>
            <span className="rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-[13px] text-graphite-300" style={d(0)}>
              <span className="size-1.5 rounded-full bg-petrol-400" />Complaint analytics for food quality teams
            </span>
            <h1 className="rise mt-6 text-[54px] leading-[62px] max-lg:text-[46px] max-lg:leading-[54px] max-md:text-[36px] max-md:leading-[44px] font-bold tracking-[-0.025em]" style={d(90)}>
              Trace every complaint<br />to its cause - <span className="text-petrol-400">and prove<br className="max-sm:hidden" /> the fix held.</span>
            </h1>
            <p className="rise mt-6 text-[18px] leading-[30px] max-md:text-[16px] max-md:leading-[26px] text-graphite-300 max-w-xl" style={d(180)}>
              CauseLine brings complaint records, NLP classification, root-cause evidence and CAPA follow-up into one place, and labels every insight as recorded fact, rule or model output.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={d(270)}>
              <Link to="/raise" className="cta cta-primary h-12 px-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-petrol-500 hover:bg-petrol-600 text-[16px] font-semibold">
                Raise a Complaint <ArrowRight className="cta-arrow size-4" />
              </Link>
              <Link to="/register" className="cta cta-ghost h-12 px-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-white/25 hover:bg-white/10 text-[16px] font-semibold">
                View complaint register <ArrowRight className="cta-arrow size-4 opacity-70" />
              </Link>
            </div>
          </div>
          <div className="rise" style={d(320)}><Mockup /></div>
        </div>
      </div>
      <div className="relative border-t border-white/10 bg-graphite-900/70 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-5 py-6">
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-petrol-400 mb-4">What CauseLine covers</p>
          <ul className="grid gap-x-5 gap-y-5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Capabilities">
            {POINTS.map((p, i) => (
              <li key={p.t} className="rise flex gap-3" style={d(450 + i * 70)}>
                <span className="size-8 shrink-0 grid place-items-center rounded-md border border-white/15 bg-white/[0.04]"><p.icon className="size-4 text-petrol-400" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-white leading-5">{p.t}</span>
                  <span className="block mt-0.5 text-[12.5px] leading-[18px] text-graphite-400">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

import { cx } from "../../utils/format";
import { useOrbit } from "../../hooks/useMotion";
import type { RefObject } from "react";
import { delay, Eyebrow, SectionTitle } from "./bits";

const LOOP = [
  { k: "Detect", t: "A complaint arrives", d: "Raised on the public form or imported from a file, and saved with a reference number before any analysis runs.", note: "NLP category shortlist · food-safety rule check" },
  { k: "Investigate", t: "Find the likely cause", d: "Similar past complaints and recorded causes are shown as evidence. Root-cause hypotheses appear only after a person confirms the category.", note: "Similarity retrieval · root-cause model (hypothesis)" },
  { k: "Correct", t: "Act on the cause", d: "The complaint is linked to a corrective and preventive action (CAPA) by its identifier, and the confirmed cause is recorded separately.", note: "CAPA register · human-confirmed cause" },
  { k: "Verify", t: "Prove the fix held", d: "A closed CAPA is not assumed effective. Later complaints linked to the same CAPA show whether the problem came back.", note: "Recurrence after CAPA · zombie CAPA detector" },
];

const C = 170, R = 118;
const pt = (deg: number) => [C + R * Math.cos((deg * Math.PI) / 180), C + R * Math.sin((deg * Math.PI) / 180)] as const;
const ANG = [-90, 0, 90, 180]; // Detect top, Investigate right, Correct bottom, Verify left (clockwise)
const arc = (from: number) => { const [x1, y1] = pt(from), [x2, y2] = pt(from + 90); return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`; };
const LABEL: Record<number, { x: number; y: number; anchor: "middle" | "start" | "end" }> = {
  [-90]: { x: C, y: C - R - 30, anchor: "middle" }, 0: { x: C + R + 28, y: C + 5, anchor: "start" },
  90: { x: C, y: C + R + 42, anchor: "middle" }, 180: { x: C - R - 28, y: C + 5, anchor: "end" },
};

const STEP_MS = 2800;

function LoopDiagram({ active, lap, onPick, markerRef }: { active: number; lap: number; onPick: (i: number) => void; markerRef: RefObject<SVGGElement | null> }) {
  return (
    <svg viewBox="-70 0 480 360" className="w-full max-w-[460px] mx-auto" role="img" aria-label={`Closed loop: Detect, Investigate, Correct, Verify. Current step: ${LOOP[active].k}`}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 6" />
      {ANG.map((a) => { const m = a + 45, [x, y] = pt(m); return <path key={a} d="M -4 -5 L 2 0 L -4 5" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" strokeLinecap="round" transform={`translate(${x} ${y}) rotate(${m + 90})`} />; })}
      <path key={lap} d={arc(ANG[active])} pathLength={100} fill="none" stroke="var(--color-petrol-500)" strokeWidth="3" strokeLinecap="round" className="trail-arc" style={{ animationDuration: `${STEP_MS}ms` }} />
      {/* centre */}
      <circle cx={C} cy={C} r="62" fill="var(--primary-tint)" stroke="var(--color-petrol-100)" />
      <text x={C} y={C + 4} textAnchor="middle" className="fill-[var(--ink)]" style={{ font: "700 26px var(--font-sans)", letterSpacing: "-0.01em" }}>CAPA</text>
      <text x={C} y={C + 24} textAnchor="middle" className="fill-[var(--muted)]" style={{ font: "500 9.5px var(--font-mono)", letterSpacing: "0.18em" }}>CLOSED LOOP</text>
      {ANG.map((a, i) => {
        const [x, y] = pt(a), on = i === active, L = LABEL[a];
        return (
          <g key={a} onClick={() => onPick(i)} className="cursor-pointer" role="button" tabIndex={0} aria-label={`Show step ${i + 1}: ${LOOP[i].k}`}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(i))}>
            {on && <circle cx={x} cy={y} r="17" fill="var(--color-petrol-400)" className="node-ping" />}
            <circle cx={x} cy={y} r="17" fill={on ? "var(--color-petrol-500)" : "var(--surface)"} stroke={on ? "var(--color-petrol-500)" : "var(--line-strong)"} strokeWidth="1.5" style={{ transition: "fill .3s" }} />
            <text x={x} y={y + 4.5} textAnchor="middle" style={{ font: "600 13px var(--font-mono)" }} className={on ? "fill-white" : "fill-[var(--ink-2)]"}>{i + 1}</text>
            <text x={L.x} y={L.y} textAnchor={L.anchor} style={{ font: `${on ? 700 : 600} 15px var(--font-sans)`, transition: "fill .3s" }} className={on ? "fill-[var(--link)]" : "fill-[var(--ink)]"}>{LOOP[i].k}</text>
          </g>
        );
      })}
      {/* orbiting dot: travels continuously round the loop; each station lights up as the dot reaches it */}
      <g ref={markerRef} aria-hidden style={{ pointerEvents: "none" }}>
        <circle cx={C} cy={C - R} r="13" fill="var(--color-petrol-400)" opacity="0.22" />
        <circle cx={C} cy={C - R} r="6.5" fill="var(--color-petrol-500)" stroke="var(--surface)" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

/** Rotating "every step logged" stamp. */
function Stamp() {
  return (
    <svg viewBox="0 0 100 100" className="size-[84px] z-10 absolute -top-8 -right-6 max-sm:-right-2 animate-[spin_22s_linear_infinite] motion-reduce:animate-none" aria-hidden>
      <defs><path id="stamp-c" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" /></defs>
      <circle cx="50" cy="50" r="47" fill="var(--surface)" stroke="var(--line-strong)" strokeDasharray="2 3" />
      <text style={{ font: "600 8.6px var(--font-mono)" }} className="fill-[var(--muted)]"><textPath href="#stamp-c" textLength="222" lengthAdjust="spacing">EVERY STEP LOGGED · AUDIT TRAIL ·</textPath></text>
      <circle cx="50" cy="50" r="5" fill="var(--color-petrol-500)" />
    </svg>
  );
}

export function ClosedLoop() {
  const { markerRef, active, lap, select } = useOrbit(4, STEP_MS, C, C);
  return (
    <section id="how" className="bg-canvas py-28 max-md:py-20 scroll-mt-16 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-5 grid gap-14 lg:grid-cols-[1fr_1.05fr] items-center">
        <div className="reveal">
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle>Close the loop on every complaint</SectionTitle>
          <p className="mt-4 text-[17px] leading-7 text-ink-2 max-w-lg">From the first report to proof that the fix worked. Each step is dated, attributed and linked to the one before it.</p>
          <div className="mt-8"><LoopDiagram active={active} lap={lap} onPick={select} markerRef={markerRef} /></div>
        </div>
        <div className="reveal relative" style={delay(120)}>
          <ol className="rounded-xl border border-line bg-surface shadow-[0_20px_50px_-24px_rgba(11,17,23,0.25)] divide-y divide-line overflow-hidden">
            {LOOP.map((s, i) => (
              <li key={s.k}>
                <button type="button" onClick={() => select(i)} aria-current={i === active ? "step" : undefined}
                  className={cx("relative w-full text-left grid grid-cols-[44px_1fr] gap-3 px-6 py-5 transition-colors", i === active ? "bg-primary-tint" : "hover:bg-surface-2")}>
                  <span className={cx("absolute left-0 top-0 bottom-0 w-[3px] transition-colors", i === active ? "bg-petrol-500" : "bg-transparent")} aria-hidden />
                  <span className={cx("font-mono text-[13px] pt-0.5", i === active ? "text-link font-semibold" : "text-faint")}>0{i + 1}</span>
                  <span>
                    <span className="flex items-baseline gap-2 flex-wrap"><span className="text-[17px] font-bold text-ink">{s.t}</span><span className="text-[13px] font-semibold text-link">{s.k}</span></span>
                    <span className="block mt-1.5 text-[15px] leading-6 text-ink-2">{s.d}</span>
                    <span className="block mt-2.5 font-mono text-[12px] text-muted"><span className="text-link">—</span> {s.note}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <Stamp />
        </div>
      </div>
    </section>
  );
}

/** Chart components. Rules (dataviz skill + DESIGN_SYSTEM §5.6): one y-axis only, validated categorical order,
 * recessive horizontal grid, 2px lines, hover tooltips, legend for >=2 series, and a table view for every chart. */
import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3, Info } from "lucide-react";
import { ProvenanceBadge, type Provenance } from "../components/ui/ProvenanceBadge";
import { Skeleton, ErrorState, EmptyState } from "../components/ui/primitives";
import { cx, fmtInt, fmtMonth } from "../utils/format";

export const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)"];
export const SEVERITY_RAMP: Record<string, string> = { Routine: "#9fd0e0", Major: "#0e86a8", Critical: "#083f52" }; // single-hue ordinal ramp
const AXIS = { fontSize: 11, fill: "var(--muted)" };

export function ChartCard({ title, subtitle, provenance, definition, children, table, loading, error, empty, className, height = 280, actions }: {
  title: string; subtitle?: ReactNode; provenance: Provenance; definition?: string; children: ReactNode; table: ReactNode; loading?: boolean; error?: unknown;
  empty?: boolean; className?: string; height?: number; actions?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cx("bg-surface border border-line rounded-[var(--radius-card)] shadow-card min-w-0 flex flex-col", className)} aria-label={title}>
      <header className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-6">{title}</h3>
            <ProvenanceBadge kind={provenance} />
          </div>
          {subtitle && <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 no-print">
          {actions}
          {definition && (
            <span className="relative group">
              <button aria-label={`How ${title} is calculated`} className="size-8 grid place-items-center rounded text-muted hover:bg-surface-hover"><Info className="size-4" /></button>
              <span role="tooltip" className="pointer-events-none absolute right-0 top-9 z-20 w-64 rounded-[var(--radius-card)] border border-line bg-surface p-2.5 text-[12px] text-ink-2 shadow-pop opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">{definition}</span>
            </span>
          )}
          <button aria-label={asTable ? "Show chart" : "Show data table"} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className="size-8 grid place-items-center rounded text-muted hover:bg-surface-hover">
            {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
          </button>
        </div>
      </header>
      <div className="p-4 pt-3 flex-1 min-h-0">
        {error ? <ErrorState error={error} /> : loading ? <Skeleton className="w-full" /> : empty ? <EmptyState title="No data for the current filters" /> :
          asTable ? <div className="max-h-[320px] overflow-auto">{table}</div> : <div style={{ height }} className="max-md:!h-[220px]">{children}</div>}
        {loading && <div style={{ height }} />}
      </div>
    </section>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="w-full text-[12px]">
      <thead><tr>{head.map((h, i) => <th key={h} className={cx("text-left font-semibold text-muted border-b border-line py-1.5 px-2", i > 0 && "text-right")}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line">{r.map((c, j) => <td key={j} className={cx("py-1.5 px-2", j > 0 && "text-right num")}>{typeof c === "number" ? fmtInt(c) : c ?? "—"}</td>)}</tr>)}</tbody>
    </table>
  );
}

function Tip({ active, payload, label, labelFmt, valueFmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string | number; labelFmt?: (l: string | number) => string; valueFmt?: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface shadow-pop px-3 py-2 text-[12px] min-w-36">
      <div className="font-semibold text-ink mb-1">{labelFmt ? labelFmt(label ?? "") : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: p.color }} />{p.name}</span>
          <span className="num font-medium text-ink">{valueFmt ? valueFmt(p.value, p.dataKey) : fmtInt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2 mb-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? <span className="w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="size-2.5 rounded-[2px]" style={{ background: i.color }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({ data, xKey = "month", series, ma }: { data: Record<string, any>[]; xKey?: string; series: { key: string; label: string }[]; ma?: { key: string; label: string } }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const legend = [...series.map((s, i) => ({ label: s.label, color: SERIES[i] })), ...(ma ? [{ label: ma.label, color: "var(--ink-2)", dashed: true }] : [])];
  return (
    <div className="h-full flex flex-col">
      {legend.length > 1 && <Legend items={legend} />}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} tickFormatter={xKey === "month" ? fmtMonth : undefined} minTickGap={28} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip content={<Tip labelFmt={xKey === "month" ? (l) => fmtMonth(String(l)) : undefined} />} cursor={{ stroke: "var(--line-strong)" }} />
            {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} fill={SERIES[i]} fillOpacity={series.length === 1 ? 0.1 : 0} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />)}
            {ma && <Line type="monotone" dataKey={ma.key} name={ma.label} stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LinesChart({ data, xKey, series }: { data: Record<string, any>[]; xKey: string; series: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="h-full flex flex-col">
      <Legend items={series.map((s, i) => ({ label: s, color: SERIES[i] ?? "var(--c-other)" }))} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--line-strong)" }} />
            {series.map((s, i) => <Line key={s} type="monotone" dataKey={s} name={s} stroke={SERIES[i] ?? "var(--c-other)"} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bar list in plain HTML: readable long labels, direct values, hover title. Single series -> no legend. */
export function BarList({ rows, color = "var(--c1)", onSelect, valueFmt = fmtInt }: { rows: { label: string; count: number }[]; color?: string; onSelect?: (label: string) => void; valueFmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex justify-between gap-3 text-[12px] mb-1"><span className="truncate text-ink-2">{r.label}</span><span className="num font-medium text-ink">{valueFmt(r.count)}</span></div>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(100 * r.count) / max}%`, background: color }} /></div>
          </>
        );
        return <li key={r.label} title={`${r.label}: ${valueFmt(r.count)}`}>{onSelect ? <button className="w-full text-left hover:opacity-80" onClick={() => onSelect(r.label)}>{inner}</button> : inner}</li>;
      })}
    </ul>
  );
}

/** Pareto on ONE percentage axis: bars = share of total, line = cumulative share; 80% reference. */
export function ParetoChart({ rows }: { rows: { label: string; pct: number; cum_pct: number; value: number; vital_few: boolean }[] }) {
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  // cumulative share can round to 100.01 - clamp so the last point stays on the 0-100 axis
  const data = rows.map((r) => ({ ...r, cum_pct: Math.min(100, r.cum_pct), short: r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label }));
  return (
    <div className="h-full flex flex-col">
      <Legend items={[{ label: "Share of total (%)", color: "var(--c1)" }, { label: "Cumulative share (%)", color: "var(--c2)" }, { label: "Outside vital few", color: "var(--c-other)" }]} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {narrow ? <XAxis dataKey="short" tick={false} height={8} axisLine={{ stroke: "var(--line)" }} />
              : <XAxis dataKey="short" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} interval={0} angle={-35} textAnchor="end" height={70} axisLine={{ stroke: "var(--line)" }} />}
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" width={44} />
            <Tooltip content={<Tip labelFmt={(l) => data.find((d) => d.short === l)?.label ?? String(l)} valueFmt={(v) => `${v.toFixed(1)}%`} />} cursor={{ fill: "var(--surface-hover)" }} />
            <ReferenceLine y={80} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: "80%", position: "insideTopRight", fontSize: 10, fill: "var(--muted)" }} />
            <Bar dataKey="pct" name="Share" radius={[3, 3, 0, 0]} maxBarSize={28}
              shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={3} fill={p.payload.vital_few ? "var(--c1)" : "var(--c-other)"} />} // eslint-disable-line @typescript-eslint/no-explicit-any
            />
            <Line dataKey="cum_pct" name="Cumulative" stroke="var(--c2)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--c2)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StackedBars({ data, xKey, keys, colors }: { data: Record<string, any>[]; xKey: string; keys: string[]; colors: Record<string, string> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="h-full flex flex-col">
      <Legend items={keys.map((k) => ({ label: k, color: colors[k] }))} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap={3}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-hover)" }} />
            {keys.map((k) => <Bar key={k} dataKey={k} name={k} stackId="s" fill={colors[k]} stroke="var(--surface)" strokeWidth={1} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ColumnChart({ data, xKey, yKey, label, highlight }: { data: Record<string, any>[]; xKey: string; yKey: string; label: string; highlight?: (d: any) => boolean }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={12} tickFormatter={xKey === "month" ? fmtMonth : undefined} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip content={<Tip labelFmt={xKey === "month" ? (l) => fmtMonth(String(l)) : undefined} />} cursor={{ fill: "var(--surface-hover)" }} />
        <Bar dataKey={yKey} name={label} radius={[3, 3, 0, 0]} maxBarSize={32}
          shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={2} fill={highlight?.(p.payload) ? "var(--c2)" : "var(--c1)"} />} // eslint-disable-line @typescript-eslint/no-explicit-any
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-7 w-28" role="img" aria-label={`${label}: ${values.join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Area type="monotone" dataKey="v" stroke="var(--c1)" strokeWidth={1.5} fill="var(--c1)" fillOpacity={0.12} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rate with 95% CI whiskers, HTML (one axis 0-100%). */
export function RateCIList({ rows, overall }: { rows: { label: string; n: number; ineffective_rate: number; ci_low: number | null; ci_high: number | null; significantly_worse: boolean }[]; overall: number | null }) {
  return (
    <div>
      <div className="relative ml-[40%] h-4 text-[10px] text-muted mb-1">
        {[0, 25, 50, 75, 100].map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t}%` }}>{t}%</span>)}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[12px]" title={`${r.label}: ${(r.ineffective_rate * 100).toFixed(1)}% ineffective (95% CI ${((r.ci_low ?? 0) * 100).toFixed(0)}–${((r.ci_high ?? 0) * 100).toFixed(0)}%), n=${r.n}`}>
            <span className="w-[40%] truncate text-ink-2 pr-2">{r.label} <span className="text-faint num">n={r.n}</span></span>
            <div className="relative flex-1 h-5">
              {overall !== null && <span className="absolute top-0 bottom-0 border-l border-dashed border-muted" style={{ left: `${overall * 100}%` }} aria-hidden />}
              <span className="absolute top-1/2 h-px bg-ink-2" style={{ left: `${(r.ci_low ?? 0) * 100}%`, width: `${((r.ci_high ?? 0) - (r.ci_low ?? 0)) * 100}%` }} aria-hidden />
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2.5 rounded-full border-2 border-surface" style={{ left: `${r.ineffective_rate * 100}%`, background: r.significantly_worse ? "var(--c2)" : "var(--c1)" }} aria-hidden />
            </div>
            <span className="w-12 text-right num font-medium">{(r.ineffective_rate * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
      <Legend items={[{ label: "Ineffective rate (dot) with 95% Wilson interval", color: "var(--c1)" }, { label: "Significantly worse than overall", color: "var(--c2)" }, { label: "Overall rate", color: "var(--muted)", dashed: true }]} />
    </div>
  );
}

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { Banner, Button, Card, PageHeader, Pill } from "../../components/ui/primitives";
import { KpiCard } from "../../components/ui/KpiCard";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { Select } from "../../components/ui/forms";
import { ChartCard, PathChart, SimpleTable } from "../../charts/charts";
import { fmtDate, fmtInt, fmtPct } from "../../utils/format";

type Row = { root_cause_category: string; baseline_complaints: number; assessed_capas: number; effectiveness_rate: number | null; effectiveness_ci: [number, number] | null;
  estimable: boolean; avoidable_estimate: number | null; avoidable_range: [number, number] | null; selected: boolean };
type Resp = { window: { months: number; from: string; to: string; reference_note: string | null }; baseline: number; attributable: number; unattributed: number; not_estimable: number;
  selected_causes: number; avoidable_estimate: number; avoidable_range: [number, number]; remaining_estimate: number; remaining_range: [number, number];
  floor_without_attribution: number; rows: Row[]; path: { step: number; label: string; remaining: number; remaining_low: number; remaining_high: number }[];
  assumptions: string[]; label: string; method: string };

const r0 = (n: number) => fmtInt(Math.round(n));

export default function Simulator() {
  const [months, setMonths] = useState("12");
  const [chosen, setChosen] = useState<string[] | null>(null); // null = every estimable cause
  const params = chosen === null ? { months } : chosen.length ? { months, cause: chosen } : { months, all_causes: false };
  const q = useQuery({ queryKey: ["zero-path", params], placeholderData: keepPreviousData, queryFn: () => api.get<Resp>("/api/analytics/zero-complaint-path", params) });
  const d = q.data;
  const estimable = useMemo(() => (d?.rows ?? []).filter((r) => r.estimable).map((r) => r.root_cause_category), [d]);
  const isOn = (c: string) => (chosen === null ? true : chosen.includes(c));
  const toggle = (c: string) => setChosen((cur) => { const base = cur ?? estimable; return base.includes(c) ? base.filter((x) => x !== c) : [...base, c]; });
  const notAttributable = d ? d.unattributed + d.not_estimable : 0;
  return (
    <>
      <PageHeader title="Zero Complaint Path Simulator" description="How far could corrective actions on each recorded root cause move complaints towards zero, if they work as well as past CAPAs on the same cause?"
        meta={<><Pill tone="warn">ESTIMATE</Pill><ProvenanceBadge kind="rule" label="Historical rates, rule-based" /></>} />
      <SyntheticNotice what="Simulator inputs (cause distribution and CAPA effectiveness)" />
      <Banner tone="warn" className="mb-4" title="Estimates, not forecasts">
        Every figure on this page is an estimate from historical, synthetic data. It shows the size of the opportunity per cause; it does not predict next year and does not prove that a CAPA causes a reduction.
        {d?.window.reference_note && <span className="block mt-1">{d.window.reference_note}</span>}
      </Banner>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[13px] text-ink-2">Baseline window
          <Select aria-label="Baseline window" value={months} onChange={(e) => setMonths(e.target.value)} className="mt-1 w-44 h-9"
            options={[{ value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }, { value: "24", label: "Last 24 months" }]} />
        </label>
        {d && <p className="text-[12px] text-muted pb-2">Baseline {fmtDate(d.window.from)} – {fmtDate(d.window.to)} (recorded complaints)</p>}
      </div>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-5">
        <KpiCard label="Baseline complaints" value={fmtInt(d?.baseline)} provenance="recorded" loading={q.isLoading} hint={d ? `${fmtInt(d.attributable)} with a Confirmed/Probable recorded cause` : undefined} />
        <KpiCard label="Estimated avoidable" value={d ? r0(d.avoidable_estimate) : undefined} provenance="rule" loading={q.isLoading}
          hint={d ? `Range ${r0(d.avoidable_range[0])}–${r0(d.avoidable_range[1])} · ${d.selected_causes} cause${d.selected_causes === 1 ? "" : "s"} selected` : undefined} provenanceTitle="Estimate: baseline per cause x historical CAPA effectiveness" />
        <KpiCard label="Estimated remaining" value={d ? r0(d.remaining_estimate) : undefined} provenance="rule" loading={q.isLoading}
          hint={d ? `Range ${r0(d.remaining_range[0])}–${r0(d.remaining_range[1])}${d.baseline ? ` · ${fmtPct(1 - d.remaining_estimate / d.baseline)} lower` : ""}` : undefined} provenanceTitle="Estimate" />
        <KpiCard label="Not reachable on this evidence" value={fmtInt(notAttributable)} provenance="recorded" loading={q.isLoading}
          hint="No Confirmed/Probable cause recorded, or too few assessed CAPAs to estimate" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12 mb-4">
        <ChartCard className="xl:col-span-7" title="Path towards zero" subtitle={d ? `Causes added largest estimated effect first · ${d.label}` : undefined} provenance="rule" loading={q.isLoading} error={q.error}
          empty={!d?.path.length} height={300} definition={d?.method}
          table={<SimpleTable head={["Step", "Cause added", "Remaining (estimate)", "Range"]} rows={(d?.path ?? []).map((p) => [p.step, p.step ? p.label : "Baseline", Math.round(p.remaining), p.step ? `${Math.round(p.remaining_low)}–${Math.round(p.remaining_high)}` : "-"])} />}>
          {d && <PathChart data={d.path} floor={d.floor_without_attribution} />}
        </ChartCard>
        <Card className="xl:col-span-5" title="Assumptions" actions={<Pill tone="warn">ESTIMATE</Pill>}>
          <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-ink-2">{(d?.assumptions ?? []).map((a) => <li key={a}>{a}</li>)}</ol>
          <p className="mt-3 text-[12px] text-muted">{d?.method}</p>
        </Card>
      </div>
      <Card title="Root causes in the baseline" subtitle="Tick the causes that would receive a new CAPA. Effectiveness is the share of past CAPAs on that cause with no similar recurrence (recorded label)." bodyClass="p-0"
        actions={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setChosen(null)}>Select all</Button><Button size="sm" variant="ghost" onClick={() => setChosen([])}>Clear</Button></div>}>
        <ul className="md:hidden divide-y divide-line" aria-label="Root causes in the baseline">
          {(d?.rows ?? []).map((r) => (
            <li key={r.root_cause_category}>
              <label className="flex gap-3 p-3 min-h-11 items-start">
                <input type="checkbox" className="size-5 mt-0.5 accent-[var(--primary)] shrink-0" disabled={!r.estimable} checked={r.estimable && isOn(r.root_cause_category)} onChange={() => toggle(r.root_cause_category)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{r.root_cause_category}</span>
                  <span className="block text-[12px] text-muted num">{fmtInt(r.baseline_complaints)} in baseline · {r.estimable ? <>effectiveness {fmtPct(r.effectiveness_rate)} (n={r.assessed_capas})</> : "insufficient data"}</span>
                  {r.estimable && <span className="block text-[12px] text-ink-2 num">Avoidable (estimate) {r.avoidable_estimate!.toFixed(1)} · range {r.avoidable_range![0].toFixed(0)}–{r.avoidable_range![1].toFixed(0)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full text-[13px] border-collapse">
            <caption className="sr-only">Root causes, historical CAPA effectiveness and estimated avoidable complaints</caption>
            <thead><tr className="bg-surface-2 text-left text-[12px] text-muted">
              <th scope="col" className="px-3 h-9 font-semibold w-10"><span className="sr-only">Include</span></th>
              <th scope="col" className="px-3 h-9 font-semibold">Root cause (recorded)</th>
              <th scope="col" className="px-3 h-9 font-semibold text-right">Baseline</th>
              <th scope="col" className="px-3 h-9 font-semibold text-right max-md:hidden">Assessed CAPAs</th>
              <th scope="col" className="px-3 h-9 font-semibold text-right">CAPA effectiveness</th>
              <th scope="col" className="px-3 h-9 font-semibold text-right">Avoidable (estimate)</th>
            </tr></thead>
            <tbody>
              {(d?.rows ?? []).map((r) => (
                <tr key={r.root_cause_category} className="border-b border-line h-10">
                  <td className="px-3"><input type="checkbox" className="size-4 accent-[var(--primary)]" disabled={!r.estimable} checked={r.estimable && isOn(r.root_cause_category)}
                    onChange={() => toggle(r.root_cause_category)} aria-label={`Include ${r.root_cause_category}`} /></td>
                  <td className="px-3"><span className="block max-w-80 truncate" title={r.root_cause_category}>{r.root_cause_category}</span></td>
                  <td className="px-3 text-right num">{fmtInt(r.baseline_complaints)}</td>
                  <td className="px-3 text-right num max-md:hidden">{fmtInt(r.assessed_capas)}</td>
                  <td className="px-3 text-right num">{r.estimable ? <span title={`95% interval ${fmtPct(r.effectiveness_ci![0])}–${fmtPct(r.effectiveness_ci![1])}`}>{fmtPct(r.effectiveness_rate)}</span> : <span className="text-faint" title="Fewer than 10 assessed CAPAs on this cause">Insufficient data</span>}</td>
                  <td className="px-3 text-right num">{r.estimable ? <>{r.avoidable_estimate!.toFixed(1)} <span className="text-muted text-[12px]">({r.avoidable_range![0].toFixed(0)}–{r.avoidable_range![1].toFixed(0)})</span></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d && !d.rows.length && <p className="p-6 text-[13px] text-muted">No complaint in this window has a Confirmed or Probable recorded root cause, so nothing can be estimated.</p>}
      </Card>
    </>
  );
}

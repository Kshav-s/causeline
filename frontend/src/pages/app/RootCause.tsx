import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useCapabilities } from "../../hooks/auth";
import { Banner, Card, Mono, PageHeader } from "../../components/ui/primitives";
import { KpiCard } from "../../components/ui/KpiCard";
import { DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { SearchInput } from "../../components/ui/forms";
import { Drawer } from "../../components/ui/overlays";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { ChartCard, ParetoChart, SimpleTable } from "../../charts/charts";
import { fmtDate, fmtInt, fmtPct } from "../../utils/format";
import type { Pareto } from "../../types/api";

type Cause = { root_cause_category: string; complaints: number; confirmed: number; probable: number; hypothesis: number; unknown: number; top_category: string | null; first_seen: string; last_seen: string };
type RC = { total: number; with_recorded_cause: number; confirmed_or_probable: number; distinct_causes: number; status_counts: Record<string, number>; causes: Cause[]; pareto: Pareto;
  associations: { complaint_category: string; root_cause_category: string; n: number; confirmed: number; share_within_category: number }[] };
type Hyp = { complaint_id: string; product_name: string; complaint_category: string; root_cause_status: string; received: string; hypotheses: { cause: string; probability: number }[] };

export default function RootCause() {
  const { data: caps } = useCapabilities();
  const q = useQuery({ queryKey: ["root-cause"], queryFn: () => api.get<RC>("/api/root-cause") });
  const [sel, setSel] = useState<Cause | null>(null);
  const [hq, setHq] = useState(""); const [hp, setHp] = useState(1);
  const hyp = useQuery({ queryKey: ["rc-hyp", hq, hp], placeholderData: keepPreviousData, queryFn: () => api.get<{ items: Hyp[]; total: number; model_version: string }>("/api/root-cause/hypotheses", { q: hq, page: hp, page_size: 10 }) });
  const d = q.data;
  const top = d?.causes[0];
  const assocFor = (c: string) => (d?.associations ?? []).filter((a) => a.root_cause_category === c).sort((a, b) => b.n - a.n);
  const cols: Column<Cause>[] = [
    { key: "c", header: "Root cause (recorded)", cell: (r) => <span className="font-medium">{r.root_cause_category}</span> },
    { key: "cat", header: "Most common category", hideBelow: "lg", cell: (r) => r.top_category },
    { key: "n", header: "Complaints", align: "right", cell: (r) => fmtInt(r.complaints) },
    { key: "s", header: "Status mix", cell: (r) => (
      <div className="flex h-2 w-36 rounded-full overflow-hidden bg-surface-hover" title={`Confirmed ${r.confirmed} · Probable ${r.probable} · Hypothesis ${r.hypothesis} · Unknown ${r.unknown}`}>
        {[[r.confirmed, "var(--c4)"], [r.probable, "var(--c5)"], [r.hypothesis, "var(--c6)"], [r.unknown, "var(--c-other)"]].map(([n, c], i) => <span key={i} style={{ width: `${(100 * (n as number)) / r.complaints}%`, background: c as string }} />)}
      </div>) },
    { key: "seen", header: "Last seen", align: "right", hideBelow: "lg", cell: (r) => fmtDate(r.last_seen) },
  ];
  return (
    <>
      <PageHeader title="Root cause intelligence" description="Recorded root causes and the evidence behind them. Model hypotheses are shown separately and never as confirmed causes." />
      <Banner tone="info" className="mb-5" title="How to read this page">
        Causes in the table and Pareto are <b>recorded</b> in the source data with a status (Confirmed, Probable, Hypothesis, Unknown). Hypotheses from the root-cause model appear only in the lower section and on complaint pages, labelled as predictions.
      </Banner>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-5">
        <KpiCard label="With a recorded cause" value={d ? fmtPct(d.with_recorded_cause / d.total) : undefined} hint={d ? `${fmtInt(d.with_recorded_cause)} of ${fmtInt(d.total)} complaints` : undefined} provenance="recorded" loading={q.isLoading} />
        <KpiCard label="Confirmed or probable" value={fmtInt(d?.confirmed_or_probable)} hint="Recorded status" provenance="recorded" loading={q.isLoading} />
        <KpiCard label="Distinct causes" value={fmtInt(d?.distinct_causes)} provenance="recorded" loading={q.isLoading} />
        <KpiCard label="Most frequent cause" value={<span className="text-lg leading-7 block truncate" title={top?.root_cause_category}>{top?.root_cause_category ?? "—"}</span>} hint={top ? `${fmtInt(top.complaints)} complaints` : undefined} provenance="recorded" loading={q.isLoading} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12 mb-4">
        <ChartCard className="xl:col-span-7" title="Pareto of confirmed & probable causes" subtitle={d ? `${d.pareto.n_vital_few} of ${d.pareto.n_items} causes make up 80%` : undefined} provenance="rule" loading={q.isLoading} error={q.error} height={320}
          empty={!d?.pareto.rows.length} definition="Only complaints whose recorded root-cause status is Confirmed or Probable."
          table={<SimpleTable head={["Cause", "Complaints", "Share %", "Cumulative %"]} rows={(d?.pareto.rows ?? []).map((r) => [r.label, r.value, r.pct.toFixed(1), r.cum_pct.toFixed(1)])} />}>
          <ParetoChart rows={(d?.pareto.rows ?? []).slice(0, 15)} />
        </ChartCard>
        <Card className="xl:col-span-5" title="Recorded root-cause status" subtitle="All complaints">
          <ul className="space-y-2.5">
            {d && Object.entries(d.status_counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k}>
                <div className="flex justify-between text-[13px]"><span>{k}</span><span className="num">{fmtInt(v)} · {fmtPct(v / d.total, 0)}</span></div>
                <div className="h-2 mt-1 rounded-full bg-surface-hover"><div className="h-2 rounded-full" style={{ width: `${(100 * v) / d.total}%`, background: k === "Confirmed" ? "var(--c4)" : k === "Probable" ? "var(--c5)" : k === "Hypothesis" ? "var(--c6)" : "var(--c-other)" }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mb-4" title="Recorded causes" subtitle="Select a cause to see its evidence" bodyClass="p-0">
        <DataTable caption="Root causes" columns={cols} rows={d?.causes} rowKey={(r) => r.root_cause_category} loading={q.isLoading} error={q.error} onRowClick={setSel}
          mobileCard={(r) => <div><div className="font-medium">{r.root_cause_category}</div><div className="text-[12px] text-muted">{fmtInt(r.complaints)} complaints · {r.confirmed} confirmed</div></div>} />
      </Card>
      <Card title="Model hypotheses for complaints without an established cause" subtitle={`Pre-computed by the supplied ML package (root-cause model ${hyp.data?.model_version ?? ""}); possible explanations only`}
        actions={<ProvenanceBadge kind="historical" />} bodyClass="p-0">
        <div className="p-4 border-b border-line flex flex-wrap gap-2 items-center">
          <SearchInput value={hq} onChange={(v) => { setHq(v); setHp(1); }} placeholder="Complaint ID or product" className="w-72" />
          {!caps?.models["root-cause"] || caps.models["root-cause"] === "blocked" ? <span className="text-[12px] text-muted">Live root-cause model unavailable.</span> : <span className="text-[12px] text-muted">New complaints get live hypotheses from the same model on their complaint page.</span>}
        </div>
        <DataTable caption="Root-cause hypotheses" rows={hyp.data?.items} rowKey={(r) => r.complaint_id} loading={hyp.isLoading} error={hyp.error} columns={[
          { key: "id", header: "Complaint", cell: (r) => <Link to={`/app/complaints/${r.complaint_id}`} className="font-mono text-[12px] text-link hover:underline">{r.complaint_id}</Link> },
          { key: "p", header: "Product", hideBelow: "lg", cell: (r) => r.product_name },
          { key: "s", header: "Recorded status", cell: (r) => r.root_cause_status },
          { key: "h", header: "Hypotheses (score)", cell: (r) => <ol className="text-[12px]">{r.hypotheses.map((h, i) => <li key={h.cause} className={i ? "text-muted" : ""}>{i + 1}. {h.cause} <span className="num">({h.probability.toFixed(2)})</span></li>)}</ol> },
        ]} mobileCard={(r) => <div><Mono className="text-[12px] text-link">{r.complaint_id}</Mono><div className="text-[13px]">1. {r.hypotheses[0]?.cause}</div></div>} />
        {hyp.data && <Pagination page={hp} pageSize={10} total={hyp.data.total} onPage={setHp} />}
      </Card>
      <Drawer open={!!sel} onOpenChange={(o) => !o && setSel(null)} title={sel?.root_cause_category ?? ""}>
        {sel && (
          <div className="space-y-5 text-[13px]">
            <div className="flex flex-wrap gap-2"><ProvenanceBadge kind="recorded" /></div>
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[12px] text-muted">Linked complaints</dt><dd className="num font-semibold">{fmtInt(sel.complaints)}</dd></div>
              <div><dt className="text-[12px] text-muted">Confirmed / probable</dt><dd className="num">{sel.confirmed} / {sel.probable}</dd></div>
              <div><dt className="text-[12px] text-muted">First seen</dt><dd>{fmtDate(sel.first_seen)}</dd></div>
              <div><dt className="text-[12px] text-muted">Last seen</dt><dd>{fmtDate(sel.last_seen)}</dd></div>
            </dl>
            <div>
              <div className="font-semibold mb-1.5">Complaint categories where this cause was confirmed or probable</div>
              <ul className="space-y-1">{assocFor(sel.root_cause_category).map((a) => <li key={a.complaint_category} className="flex justify-between"><span>{a.complaint_category}</span><span className="num text-muted">{a.n} · {fmtPct(a.share_within_category, 0)} of that category</span></li>)}</ul>
            </div>
            <Link to={`/app/complaints?root_cause=${encodeURIComponent(sel.root_cause_category)}`} className="inline-block text-link hover:underline">View all {fmtInt(sel.complaints)} linked complaints →</Link>
          </div>
        )}
      </Drawer>
    </>
  );
}

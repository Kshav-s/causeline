import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, downloadUrl } from "../../services/api";
import { useCapabilities } from "../../hooks/auth";
import { useUrlState } from "../../hooks/useUrlState";
import { Banner, Card, Mono, PageHeader, StatusPill } from "../../components/ui/primitives";
import { KpiCard } from "../../components/ui/KpiCard";
import { Input } from "../../components/ui/forms";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { BarList, ChartCard, ParetoChart, SEVERITY_RAMP, SimpleTable, StackedBars, TrendChart } from "../../charts/charts";
import { daysBetween, fmtDate, fmtDateTime, fmtInt, fmtMonth, fmtPct } from "../../utils/format";
import type { Pareto } from "../../types/api";

interface Dash {
  kpis: { total_complaints: number; open_complaints: number; critical_complaints: number; food_safety_related: number; recurred_after_prior_capa: number; capas_total: number;
    capas_pending: number; capa_ineffective_rate: number | null; capa_assessable: number; synthetic_share: number | null; date_min: string | null; date_max: string | null; pending_reviews: number };
  monthly: { month: string; total: number; critical: number; ma3: number }[];
  severity_by_year: Record<string, number>[];
  top_products: { label: string; count: number }[];
  category_pareto: Pareto;
  attention: { oldest_open: { complaint_id: string; product_name: string; status: string; severity: string; received: string }[]; pending_reviews: number;
    ineffective_capas: { capa_id: string; product_name: string; recurrences: number; last_recurrence: string | null }[] };
  data_status: { last_import: { reference: string; file: string; at: string; rows: number } | null; records: number; filtered_records: number };
}

export default function Overview() {
  const { get, set } = useUrlState();
  const nav = useNavigate();
  const from = get("from"), to = get("to");
  const { data: caps } = useCapabilities();
  const q = useQuery({ queryKey: ["dashboard", from, to], queryFn: () => api.get<Dash>("/api/dashboard", { date_from: from, date_to: to }) });
  const d = q.data;
  const k = d?.kpis;
  const range = from || to ? `${from ? fmtDate(from) : "start"} – ${to ? fmtDate(to) : "latest"}` : k?.date_min ? `${fmtDate(k.date_min)} – ${fmtDate(k.date_max)}` : "All data";
  const last24 = d?.monthly.slice(-24) ?? [];
  return (
    <>
      <PageHeader title="Overview" description="Complaint, investigation and CAPA position computed from stored records."
        actions={<>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="from">From</label><Input id="from" type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="w-40" />
            <span className="text-muted">to</span>
            <label className="sr-only" htmlFor="to">To</label><Input id="to" type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
          </div>
          <a href={downloadUrl("/api/complaints/export.csv", { date_from: from, date_to: to })} className="h-9 px-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-sm font-medium hover:bg-surface-hover"><Download className="size-4" />Export</a>
        </>}
        meta={<span className="text-[12px] text-muted">Period: <b className="text-ink-2">{range}</b></span>} />
      {caps?.data.demo_data && (
        <Banner tone="demo" className="mb-5" title="Demonstration data">All {fmtInt(caps.data.complaints)} complaint records are synthetic (SYNTHETIC_ABT_CPD). Figures show how the platform works; they are not ABT CPD performance.</Banner>
      )}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-5">
        <KpiCard label="Complaints" value={fmtInt(k?.total_complaints)} provenance="recorded" loading={q.isLoading} to="/app/complaints" hint="Records in period" />
        <KpiCard label="Open / in progress" value={fmtInt(k?.open_complaints)} provenance="recorded" loading={q.isLoading} to="/app/complaints?tab=active" hint="Not yet closed" />
        <KpiCard label="Critical" value={fmtInt(k?.critical_complaints)} provenance="recorded" loading={q.isLoading} to="/app/complaints?severity=Critical" hint="Recorded severity" />
        <KpiCard label="Recurred after CAPA" value={fmtInt(k?.recurred_after_prior_capa)} provenance="recorded" loading={q.isLoading} to="/app/capa?tab=ineffective" hint="Linked to an earlier CAPA" />
        <KpiCard label="CAPA ineffective rate" value={fmtPct(k?.capa_ineffective_rate)} provenance="rule" loading={q.isLoading} to="/app/capa"
          unavailable={k && k.capa_assessable === 0 ? "No CAPA has an assessed outcome yet" : undefined} hint={k ? `${fmtInt(k.capa_assessable)} assessable CAPAs` : undefined}
          provenanceTitle="Share of assessed CAPAs whose recorded label is Ineffective; pending excluded" />
        <KpiCard label="Awaiting review" value={fmtInt(k?.pending_reviews)} provenance="model" loading={q.isLoading} to="/app/ai?tab=queue" hint="Model outputs without a human decision" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12 mb-4">
        <ChartCard className="xl:col-span-8" title="Complaints by month" subtitle="Last 24 months in period · dashed line = 3-month moving average" provenance="recorded" loading={q.isLoading} error={q.error} empty={!last24.length}
          definition="Count of complaints by received month. The moving average is the mean of the current and two previous months."
          table={<SimpleTable head={["Month", "Complaints", "Critical", "3-mo avg"]} rows={last24.map((m) => [fmtMonth(m.month), m.total, m.critical, m.ma3])} />}>
          <TrendChart data={last24} series={[{ key: "total", label: "Complaints" }]} ma={{ key: "ma3", label: "3-month average" }} />
        </ChartCard>
        <ChartCard className="xl:col-span-4" title="Severity by year" subtitle="Recorded severity" provenance="recorded" loading={q.isLoading} error={q.error} empty={!d?.severity_by_year.length}
          table={<SimpleTable head={["Year", "Routine", "Major", "Critical"]} rows={(d?.severity_by_year ?? []).map((r) => [r.year, r.Routine ?? 0, r.Major ?? 0, r.Critical ?? 0])} />}>
          <StackedBars data={(d?.severity_by_year ?? []).slice(-10)} xKey="year" keys={["Routine", "Major", "Critical"]} colors={SEVERITY_RAMP} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12 mb-4">
        <ChartCard className="xl:col-span-5" title="Top products" subtitle="Complaint count · select a product to filter the register" provenance="recorded" loading={q.isLoading} error={q.error} empty={!d?.top_products.length} height={300}
          table={<SimpleTable head={["Product", "Complaints"]} rows={(d?.top_products ?? []).map((r) => [r.label, r.count])} />}>
          <BarList rows={d?.top_products ?? []} onSelect={(p) => nav(`/app/complaints?product=${encodeURIComponent(p)}`)} />
        </ChartCard>
        <ChartCard className="xl:col-span-7" title="Category Pareto" subtitle={d ? `${d.category_pareto.n_vital_few} of ${d.category_pareto.n_items} categories make up 80% of complaints` : undefined} provenance="rule" loading={q.isLoading} error={q.error}
          empty={!d?.category_pareto.rows.length} height={300} definition="Bars: each category's share of complaints. Line: cumulative share. Vital few = categories needed to reach 80%."
          table={<SimpleTable head={["Category", "Complaints", "Share %", "Cumulative %"]} rows={(d?.category_pareto.rows ?? []).map((r) => [r.label, r.value, r.pct.toFixed(1), r.cum_pct.toFixed(1)])} />}>
          <ParetoChart rows={d?.category_pareto.rows ?? []} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" title="Needs attention" subtitle="Oldest unclosed complaints and CAPAs where the problem came back">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-2"><span className="overline text-muted">Oldest open complaints</span><ProvenanceBadge kind="recorded" /></div>
              <ul className="divide-y divide-line">
                {d?.attention.oldest_open.map((c) => (
                  <li key={c.complaint_id} className="py-2 flex items-center justify-between gap-2 text-[13px]">
                    <div className="min-w-0"><Link to={`/app/complaints/${c.complaint_id}`} className="font-mono text-[12px] text-link hover:underline">{c.complaint_id}</Link><div className="truncate text-ink-2">{c.product_name}</div></div>
                    <div className="text-right shrink-0"><StatusPill value={c.status} /><div className="text-[11px] text-muted mt-0.5 num">{fmtInt(daysBetween(c.received))} days open</div></div>
                  </li>
                ))}
                {d && !d.attention.oldest_open.length && <li className="py-3 text-[13px] text-muted">No open complaints in this period.</li>}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2"><span className="overline text-muted">Recent recurrences after CAPA</span><ProvenanceBadge kind="recorded" /></div>
              <ul className="divide-y divide-line">
                {d?.attention.ineffective_capas.map((c) => (
                  <li key={c.capa_id} className="py-2 flex items-center justify-between gap-2 text-[13px]">
                    <div className="min-w-0"><Link to={`/app/capa/${c.capa_id}`} className="font-mono text-[12px] text-link hover:underline">{c.capa_id}</Link><div className="truncate text-ink-2">{c.product_name}</div></div>
                    <div className="text-right shrink-0 text-[12px]"><b className="num">{c.recurrences}</b> recurrence{c.recurrences === 1 ? "" : "s"}<div className="text-muted">last {fmtDate(c.last_recurrence)}</div></div>
                  </li>
                ))}
              </ul>
              {d && d.attention.pending_reviews > 0 && <Link to="/app/ai?tab=queue" className="mt-3 inline-block text-[13px] text-link hover:underline">{fmtInt(d.attention.pending_reviews)} model outputs await human review →</Link>}
            </div>
          </div>
        </Card>
        <Card className="xl:col-span-4" title="Data status">
          <dl className="space-y-3 text-[13px]">
            <div className="flex justify-between gap-2"><dt className="text-muted">Records stored</dt><dd className="num font-medium">{fmtInt(d?.data_status.records)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">In current period</dt><dd className="num font-medium">{fmtInt(d?.data_status.filtered_records)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Latest import</dt><dd className="text-right">{d?.data_status.last_import ? <><Mono>{d.data_status.last_import.reference}</Mono><div className="text-[12px] text-muted">{fmtDateTime(d.data_status.last_import.at)}</div></> : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Data origin</dt><dd>{k?.synthetic_share === 1 ? <ProvenanceBadge kind="demo" label="Synthetic" /> : k?.synthetic_share ? `${fmtPct(k.synthetic_share, 0)} synthetic` : "Recorded"}</dd></div>
          </dl>
          {caps && caps.missing_datasets.length > 0 && (
            <div className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
              <div className="font-medium text-ink-2 mb-1">Not yet supplied ({caps.missing_datasets.length} datasets)</div>
              CAPA owners and dates, production batches, shipments and monthly KPI history are unavailable until these files are imported.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { useUrlState } from "../../hooks/useUrlState";
import { Card, PageHeader, Pill, Banner } from "../../components/ui/primitives";
import { FilterChips, Input, MultiSelect, Select } from "../../components/ui/forms";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { DataTable } from "../../components/ui/DataTable";
import { BarList, ChartCard, ColumnChart, LinesChart, ParetoChart, SimpleTable, TrendChart } from "../../charts/charts";
import { fmtInt, fmtMonth, fmtDate } from "../../utils/format";
import type { Pareto } from "../../types/api";

type Trends = { monthly: { month: string; total: number; critical: number; ma3: number }[]; top_categories: string[]; yearly_by_category: Record<string, number>[];
  day_of_week: { label: string; count: number }[]; month_of_year: { label: number; count: number }[]; closure_days: { n: number; median: number | null; p90: number | null; histogram: { bucket: string; count: number }[] };
  product_comparison: { label: string; count: number }[]; category_distribution: { label: string; count: number }[] };
type Hot = { product_id: string; product_name: string; complaint_category: string; total: number; max_in_90d: number; last_12m: number; prior_12m: number; critical: number; post_capa_recurrences: number; recurring_flag: boolean; emerging_flag: boolean; priority_score: number };
type Rec = { rows: Hot[]; recurring_groups: number; emerging_groups: number; groups: number; reference_date: string; reference_note: string | null; rule: string; post_capa_by_year: { year: number; n: number; post: number; pct: number }[] };
const DIMS = [{ value: "complaint_category", label: "Complaint category" }, { value: "defect_subcategory", label: "Defect subcategory" }, { value: "product_name", label: "Product" }, { value: "food_family", label: "Food family" },
  { value: "customer_name", label: "Customer" }, { value: "root_cause_category", label: "Root cause (recorded)" }, { value: "haccp_process_step", label: "HACCP process step" }];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Analytics() {
  const { get, getAll, set } = useUrlState();
  const f = { date_from: get("from"), date_to: get("to"), product: getAll("product"), category: getAll("category"), severity: getAll("severity") };
  const dim = get("dim", "complaint_category"), weighted = get("w") === "1";
  const opts = useQuery({ queryKey: ["complaint-filters"], queryFn: () => api.get<{ products: string[]; categories: string[]; severities: string[] }>("/api/complaints/filters"), staleTime: 300_000 });
  const t = useQuery({ queryKey: ["trends", f], queryFn: () => api.get<Trends>("/api/analytics/trends", f) });
  const p = useQuery({ queryKey: ["pareto", dim, weighted, f], queryFn: () => api.get<Pareto>("/api/analytics/pareto", { ...f, dimension: dim, weighted }) });
  const r = useQuery({ queryKey: ["recurrence", f], queryFn: () => api.get<Rec>("/api/analytics/recurrence", f) });
  const hc = useQuery({ queryKey: ["haccp"], queryFn: () => api.get<{ rows: { process_step: string; complaints: number; potential_gap_flags: number; flag_rate: number; critical: number; food_safety_related: number; controls: number; requires_review: boolean }[]; flagged_total: number; complaints_with_haccp_step: number; basis: string; plan_available: boolean; plan_note: string;
    controls: { control_id: string; process_step: string | null; complaints: number; potential_gap_flags: number; flag_rate: number; critical: number; food_safety_related: number; products: number; last_complaint: string; last_flagged: string | null }[] }>("/api/analytics/haccp") });
  const chips = (["product", "category", "severity"] as const).flatMap((k) => getAll(k).map((v) => ({ key: k + v, label: v, onRemove: () => set({ [k]: getAll(k).filter((x) => x !== v) }) })));
  const d = t.data;
  return (
    <>
      <PageHeader title="Analytics" description="Trends, Pareto, recurrence and closure analysis computed from stored complaint records." />
      <SyntheticNotice what="These analytics" />
      <Card className="mb-4" bodyClass="py-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Analytics filters">
          <Input aria-label="From date" type="date" value={get("from")} onChange={(e) => set({ from: e.target.value })} className="w-[150px]" />
          <span className="text-muted">–</span>
          <Input aria-label="To date" type="date" value={get("to")} onChange={(e) => set({ to: e.target.value })} className="w-[150px]" />
          <MultiSelect label="Product" options={opts.data?.products ?? []} value={getAll("product")} onChange={(v) => set({ product: v })} />
          <MultiSelect label="Category" options={opts.data?.categories ?? []} value={getAll("category")} onChange={(v) => set({ category: v })} />
          <MultiSelect label="Severity" options={opts.data?.severities ?? []} value={getAll("severity")} onChange={(v) => set({ severity: v })} />
        </div>
        <FilterChips chips={[...chips, ...(get("from") ? [{ key: "from", label: `From ${get("from")}`, onRemove: () => set({ from: null }) }] : []), ...(get("to") ? [{ key: "to", label: `To ${get("to")}`, onRemove: () => set({ to: null }) }] : [])]}
          onClear={() => set({ product: null, category: null, severity: null, from: null, to: null })} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 mb-4">
        <ChartCard title="Complaint trend" subtitle="Monthly count · dashed = 3-month moving average" provenance="recorded" loading={t.isLoading} error={t.error} empty={!d?.monthly.length}
          table={<SimpleTable head={["Month", "Complaints", "3-mo avg"]} rows={(d?.monthly ?? []).map((m) => [fmtMonth(m.month), m.total, m.ma3])} />}>
          <TrendChart data={d?.monthly ?? []} series={[{ key: "total", label: "Complaints" }]} ma={{ key: "ma3", label: "3-month average" }} />
        </ChartCard>
        <ChartCard title="Top categories by year" subtitle="Six most frequent categories in the filtered data" provenance="recorded" loading={t.isLoading} error={t.error} empty={!d?.yearly_by_category.length}
          table={<SimpleTable head={["Year", ...(d?.top_categories ?? [])]} rows={(d?.yearly_by_category ?? []).map((y) => [y.year, ...(d?.top_categories ?? []).map((c) => y[c] ?? 0)])} />}>
          <LinesChart data={d?.yearly_by_category ?? []} xKey="year" series={d?.top_categories ?? []} />
        </ChartCard>
      </div>

      <ChartCard className="mb-4" title="Pareto analysis" subtitle={p.data ? `${p.data.n_vital_few} of ${fmtInt(p.data.n_items)} items make up 80%${weighted ? " of severity-weighted complaints (Routine 1, Major 3, Critical 5)" : " of complaints"}${p.data.truncated ? " · top 30 shown" : ""}` : undefined}
        provenance="rule" loading={p.isLoading} error={p.error} empty={!p.data?.rows.length} height={340}
        definition="Bars: share of the total; line: cumulative share; both on one percentage axis. Vital few = items needed to reach 80%."
        actions={<>
          <Select aria-label="Pareto dimension" value={dim} onChange={(e) => set({ dim: e.target.value }, false)} options={DIMS} className="w-48 h-8" />
          <Select aria-label="Pareto measure" value={weighted ? "1" : "0"} onChange={(e) => set({ w: e.target.value === "1" ? "1" : null }, false)} options={[{ value: "0", label: "Count" }, { value: "1", label: "Severity-weighted" }]} className="w-40 h-8 max-sm:hidden" />
        </>}
        table={<SimpleTable head={["Item", weighted ? "Weighted" : "Complaints", "Share %", "Cumulative %"]} rows={(p.data?.rows ?? []).map((x) => [x.label, x.value, x.pct.toFixed(1), x.cum_pct.toFixed(1)])} />}>
        <ParetoChart rows={(p.data?.rows ?? []).slice(0, 20)} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-3 mb-4">
        <ChartCard title="Product comparison" subtitle="Top 12 products by complaints" provenance="recorded" loading={t.isLoading} error={t.error} empty={!d?.product_comparison.length} height={340}
          table={<SimpleTable head={["Product", "Complaints"]} rows={(d?.product_comparison ?? []).map((x) => [x.label, x.count])} />}>
          <div className="h-full overflow-auto pr-1"><BarList rows={d?.product_comparison ?? []} /></div>
        </ChartCard>
        <ChartCard title="Category distribution" provenance="recorded" loading={t.isLoading} error={t.error} empty={!d?.category_distribution.length} height={340}
          table={<SimpleTable head={["Category", "Complaints"]} rows={(d?.category_distribution ?? []).map((x) => [x.label, x.count])} />}>
          <div className="h-full overflow-auto pr-1"><BarList rows={d?.category_distribution ?? []} color="var(--c5)" /></div>
        </ChartCard>
        <ChartCard title="Days to closure" subtitle={d?.closure_days.n ? `Median ${d.closure_days.median} days · 90th percentile ${d.closure_days.p90} days · n=${fmtInt(d.closure_days.n)}` : undefined}
          provenance="rule" loading={t.isLoading} error={t.error} empty={!d?.closure_days.n} height={340} definition="Closed date minus received date, for closed complaints."
          table={<SimpleTable head={["Days", "Complaints"]} rows={(d?.closure_days.histogram ?? []).map((x) => [x.bucket, x.count])} />}>
          <ColumnChart data={(d?.closure_days.histogram ?? []).map((x) => ({ ...x, bucket: x.bucket.replace("90-10000", "90+").replace("-1-", "0-") }))} xKey="bucket" yKey="count" label="Complaints" />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 mb-4">
        <ChartCard title="Seasonality - month of year" provenance="recorded" loading={t.isLoading} error={t.error} empty={!d} height={240}
          table={<SimpleTable head={["Month", "Complaints"]} rows={(d?.month_of_year ?? []).map((x) => [MONTHS[x.label - 1], x.count])} />}>
          <ColumnChart data={(d?.month_of_year ?? []).map((x) => ({ m: MONTHS[x.label - 1], count: x.count }))} xKey="m" yKey="count" label="Complaints" />
        </ChartCard>
        <ChartCard title="Recurrence after a prior CAPA" subtitle="% of complaints each year recorded as recurring after an earlier CAPA" provenance="recorded" loading={r.isLoading} error={r.error} empty={!r.data?.post_capa_by_year.length} height={240}
          table={<SimpleTable head={["Year", "Complaints", "Recurrences", "%"]} rows={(r.data?.post_capa_by_year ?? []).map((x) => [x.year, x.n, x.post, x.pct])} />}>
          <ColumnChart data={r.data?.post_capa_by_year ?? []} xKey="year" yKey="pct" label="% recurring" />
        </ChartCard>
      </div>

      {hc.data && !hc.data.plan_available && <Banner tone="info" className="mb-3" title="HACCP plan not supplied - control points cannot be monitored against limits">{hc.data.plan_note}</Banner>}
      <Card className="mb-4" title="Complaint signals by HACCP control point" subtitle="Each recorded control point referenced by complaints, ranked by potential-gap flags. Review prompts only."
        actions={<ProvenanceBadge kind="recorded" />} bodyClass="p-0">
        <DataTable caption="Complaint signals by HACCP control point" rows={hc.data?.controls.slice(0, 20)} rowKey={(x) => x.control_id} loading={hc.isLoading} error={hc.error} columns={[
          { key: "id", header: "Control point", cell: (x) => <span className="font-mono text-[12px]">{x.control_id}</span> },
          { key: "s", header: "Process step", cell: (x) => <span className="block max-w-56 truncate" title={x.process_step ?? ""}>{x.process_step ?? "—"}</span> },
          { key: "n", header: "Complaints", align: "right", cell: (x) => fmtInt(x.complaints) },
          { key: "g", header: "Potential gap flags", align: "right", cell: (x) => fmtInt(x.potential_gap_flags) },
          { key: "c", header: "Critical", align: "right", hideBelow: "lg", cell: (x) => fmtInt(x.critical) },
          { key: "p", header: "Products", align: "right", hideBelow: "xl", cell: (x) => fmtInt(x.products) },
          { key: "lf", header: "Last flagged", align: "right", hideBelow: "lg", cell: (x) => x.last_flagged ? fmtDate(x.last_flagged) : "—" },
        ]} mobileCard={(x) => <div className="space-y-0.5"><div className="flex justify-between gap-2"><span className="font-mono text-[12px]">{x.control_id}</span><span className="text-[12px] text-muted">{x.potential_gap_flags} flags</span></div><div className="text-[13px] truncate">{x.process_step}</div><div className="text-[12px] text-muted">{x.complaints} complaints · {x.critical} critical</div></div>} />
      </Card>
      <Card className="mb-4" title="HACCP signals by process step" subtitle={hc.data ? `${fmtInt(hc.data.flagged_total)} recorded potential-gap flags across ${fmtInt(hc.data.complaints_with_haccp_step)} complaints with a HACCP step. ${hc.data.basis}` : undefined}
        actions={<ProvenanceBadge kind="recorded" />} bodyClass="p-0">
        <DataTable caption="HACCP signals" rows={hc.data?.rows.slice(0, 15)} rowKey={(x) => x.process_step} loading={hc.isLoading} error={hc.error} columns={[
          { key: "s", header: "Process step", cell: (x) => <span className="font-medium">{x.process_step}</span> },
          { key: "n", header: "Complaints", align: "right", cell: (x) => fmtInt(x.complaints) },
          { key: "g", header: "Potential gap flags", align: "right", cell: (x) => fmtInt(x.potential_gap_flags) },
          { key: "r", header: "Flag rate", align: "right", hideBelow: "lg", cell: (x) => `${(x.flag_rate * 100).toFixed(0)}%` },
          { key: "c", header: "Critical", align: "right", hideBelow: "lg", cell: (x) => fmtInt(x.critical) },
          { key: "f", header: "Food-safety related", align: "right", hideBelow: "xl", cell: (x) => fmtInt(x.food_safety_related) },
          { key: "v", header: "", cell: (x) => x.requires_review ? <Pill tone="warn">Needs qualified review</Pill> : null },
        ]} mobileCard={(x) => <div className="flex justify-between gap-2"><div className="min-w-0"><div className="truncate">{x.process_step}</div><div className="text-[12px] text-muted">{x.potential_gap_flags} flags · {x.complaints} complaints</div></div>{x.requires_review && <Pill tone="warn">Review</Pill>}</div>} />
      </Card>

      <Card title="Recurring product-defect hotspots" subtitle={r.data ? `${fmtInt(r.data.recurring_groups)} recurring and ${fmtInt(r.data.emerging_groups)} emerging of ${fmtInt(r.data.groups)} product × category groups, relative to ${fmtDate(r.data.reference_date)}. ${r.data.rule}${r.data.reference_note ? ` ${r.data.reference_note}` : ""}` : undefined}
        actions={<ProvenanceBadge kind="rule" />} bodyClass="p-0">
        <DataTable caption="Recurrence hotspots" rows={r.data?.rows.slice(0, 25)} rowKey={(x) => x.product_id + x.complaint_category} loading={r.isLoading} error={r.error} columns={[
          { key: "p", header: "Product", cell: (x) => <Link className="text-link hover:underline" to={`/app/complaints?product=${encodeURIComponent(x.product_name)}&category=${encodeURIComponent(x.complaint_category)}`}>{x.product_name}</Link> },
          { key: "c", header: "Category", cell: (x) => <span className="block max-w-56 truncate">{x.complaint_category}</span> },
          { key: "t", header: "Total", align: "right", cell: (x) => fmtInt(x.total) },
          { key: "w", header: "Max in 90 days", align: "right", hideBelow: "lg", cell: (x) => x.max_in_90d },
          { key: "l", header: "Last / prior 12 mo", align: "right", hideBelow: "lg", cell: (x) => `${x.last_12m} / ${x.prior_12m}` },
          { key: "cr", header: "Critical", align: "right", hideBelow: "xl", cell: (x) => x.critical },
          { key: "pc", header: "After CAPA", align: "right", hideBelow: "xl", cell: (x) => x.post_capa_recurrences },
          { key: "f", header: "Flags", cell: (x) => <div className="flex gap-1">{x.recurring_flag && <Pill tone="warn">Recurring</Pill>}{x.emerging_flag && <Pill tone="bad">Emerging</Pill>}</div> },
          { key: "s", header: "Priority", align: "right", cell: (x) => <span title="severity-weighted + 3×max-in-90d + 2×post-CAPA + 3×last-12-months">{x.priority_score}</span> },
        ]} mobileCard={(x) => <div><div className="truncate">{x.product_name}</div><div className="text-[12px] text-muted truncate">{x.complaint_category} · {x.total} complaints</div><div className="flex gap-1 mt-1">{x.emerging_flag && <Pill tone="bad">Emerging</Pill>}</div></div>} />
      </Card>
    </>
  );
}

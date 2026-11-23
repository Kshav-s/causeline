import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart2, Printer, Download } from "lucide-react";
import { api, downloadUrl } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { Banner, Button, Card, PageHeader } from "../../components/ui/primitives";
import { Input, MultiSelect } from "../../components/ui/forms";
import { ProvenanceBadge, PROVENANCE_LEGEND } from "../../components/ui/ProvenanceBadge";
import { SimpleTable } from "../../charts/charts";
import { cx, fmtDateTime, fmtInt, fmtMonth, fmtPct } from "../../utils/format";

type Report = { meta: { template: string; title: string; generated_at: string; generated_by: string; filters: Record<string, unknown>; records_in_scope: number; synthetic_share: number | null }; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const TEMPLATES = [
  { id: "complaint-summary", name: "Complaint summary", text: "Volumes, monthly trend, severity, top products and categories." },
  { id: "pareto", name: "Pareto report", text: "Vital-few categories, defects, products and recorded root causes." },
  { id: "capa-status", name: "CAPA status report", text: "Effectiveness rates with confidence intervals and most-recurring CAPAs." },
  { id: "product-quality", name: "Product quality report", text: "Product trend monitoring and recurrence hotspots." },
];

function ParetoTable({ title, p }: { title: string; p: { rows: { label: string; value: number; pct: number; cum_pct: number; vital_few: boolean }[]; n_vital_few: number; n_items: number } }) {
  return (
    <div className="mb-6 break-inside-avoid">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-[12px] text-muted mb-2">{p.n_vital_few} of {p.n_items} items make up 80%.</p>
      <SimpleTable head={["Item", "Value", "Share %", "Cumulative %"]} rows={p.rows.map((r) => [`${r.vital_few ? "● " : ""}${r.label}`, r.value, r.pct.toFixed(1), r.cum_pct.toFixed(1)])} />
    </div>
  );
}

function Body({ r }: { r: Report }) {
  const b = r.body;
  if (r.meta.template === "complaint-summary") return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[["Complaints", fmtInt(b.kpis.total_complaints)], ["Open / in progress", fmtInt(b.kpis.open_complaints)], ["Critical", fmtInt(b.kpis.critical_complaints)], ["CAPA ineffective rate", fmtPct(b.kpis.capa_ineffective_rate)]].map(([l, v]) => (
          <div key={l} className="border border-line rounded p-3"><div className="text-[12px] text-muted">{l}</div><div className="text-xl font-semibold num">{v}</div></div>))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div><h3 className="font-semibold mb-2">Top products</h3><SimpleTable head={["Product", "Complaints"]} rows={b.top_products.map((x: { label: string; count: number }) => [x.label, x.count])} /></div>
        <div><h3 className="font-semibold mb-2">Top categories</h3><SimpleTable head={["Category", "Complaints"]} rows={b.top_categories.map((x: { label: string; count: number }) => [x.label, x.count])} /></div>
      </div>
      <h3 className="font-semibold mt-6 mb-2">Last 12 months</h3>
      <SimpleTable head={["Month", "Complaints", "Critical", "3-mo avg"]} rows={b.monthly.slice(-12).map((m: { month: string; total: number; critical: number; ma3: number }) => [fmtMonth(m.month), m.total, m.critical, m.ma3])} />
    </>
  );
  if (r.meta.template === "pareto") return (
    <>
      <ParetoTable title="Complaint categories (count)" p={b.complaint_category} />
      <ParetoTable title="Complaint categories (severity-weighted)" p={b.severity_weighted_category} />
      <ParetoTable title="Defect subcategories" p={b.defect_subcategory} />
      <ParetoTable title="Products" p={b.product_name} />
      <ParetoTable title="Recorded root causes (all statuses)" p={b.root_cause_category} />
    </>
  );
  if (r.meta.template === "capa-status") return (
    <>
      <p className="mb-4 text-[13px]">{fmtInt(b.kpis.capas_total)} CAPAs · {fmtInt(b.kpis.capas_pending)} pending · ineffective rate {fmtPct(b.kpis.capa_ineffective_rate)} of {fmtInt(b.kpis.capa_assessable)} assessed (recorded rule-based label).</p>
      {[["By recorded root cause", b.by_root_cause], ["By complaint category", b.by_category]].map(([t, e]) => (
        <div key={t as string} className="mb-6 break-inside-avoid"><h3 className="font-semibold mb-2">{t as string}</h3>
          <SimpleTable head={["Group", "n", "Ineffective %", "95% CI", "Worse than overall"]} rows={(e as { rows: { label: string; n: number; ineffective_rate: number; ci_low: number; ci_high: number; significantly_worse: boolean }[] }).rows.map((x) => [x.label, x.n, (x.ineffective_rate * 100).toFixed(1), `${(x.ci_low * 100).toFixed(0)}–${(x.ci_high * 100).toFixed(0)}`, x.significantly_worse ? "Yes" : "—"])} /></div>
      ))}
      <h3 className="font-semibold mb-2">CAPAs with the most linked recurrences</h3>
      <SimpleTable head={["CAPA", "Product", "Recurrences", "Recorded effectiveness"]} rows={b.most_recurring.map((x: { capa_id: string; product_name: string; recurrences: number; effectiveness: string }) => [x.capa_id, x.product_name, x.recurrences, x.effectiveness])} />
    </>
  );
  return (
    <>
      <h3 className="font-semibold mb-1">Product monitoring</h3><p className="text-[12px] text-muted mb-2">{b.products.rule}</p>
      <SimpleTable head={["Product", "Last 12 mo", "Prior 12 mo", "Change %", "Indicator"]} rows={b.products.rows.slice(0, 25).map((x: { product_name: string; last_12m: number; prior_12m: number; change_pct: number | null; indicator: string }) => [x.product_name, x.last_12m, x.prior_12m, x.change_pct, x.indicator])} />
      <h3 className="font-semibold mt-6 mb-1">Recurrence hotspots</h3><p className="text-[12px] text-muted mb-2">{b.recurrence.rule}</p>
      <SimpleTable head={["Product", "Category", "Total", "Max 90d", "Priority"]} rows={b.recurrence.rows.map((x: { product_name: string; complaint_category: string; total: number; max_in_90d: number; priority_score: number }) => [x.product_name, x.complaint_category, x.total, x.max_in_90d, x.priority_score])} />
    </>
  );
}

export default function Reports() {
  const [tpl, setTpl] = useState("complaint-summary");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [product, setProduct] = useState<string[]>([]); const [category, setCategory] = useState<string[]>([]);
  const [run, setRun] = useState(0);
  const opts = useQuery({ queryKey: ["complaint-filters"], queryFn: () => api.get<{ products: string[]; categories: string[] }>("/api/complaints/filters"), staleTime: 300_000 });
  const params = { date_from: from, date_to: to, product, category };
  const r = useQuery({ queryKey: ["report", tpl, run], enabled: run > 0, queryFn: () => api.get<Report>(`/api/reports/${tpl}`, params) });
  return (
    <>
      <div className="no-print">
        <PageHeader title="Reports" description="Generate print-ready reports from stored records. Use your browser's print dialog to save as PDF; tables export as CSV." />
        <SyntheticNotice what="Reports generated here" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4" role="radiogroup" aria-label="Report template">
          {TEMPLATES.map((t) => (
            <button key={t.id} role="radio" aria-checked={tpl === t.id} onClick={() => setTpl(t.id)} className={cx("text-left rounded-[var(--radius-card)] border p-4 bg-surface transition-colors", tpl === t.id ? "border-petrol-500 ring-1 ring-petrol-500" : "border-line hover:border-line-strong")}>
              <FileBarChart2 className="size-5 text-link" /><div className="font-semibold mt-2">{t.name}</div><div className="text-[12px] text-muted mt-1">{t.text}</div>
            </button>
          ))}
        </div>
        <Card className="mb-4" bodyClass="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" /><span className="text-muted">–</span>
            <Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            <MultiSelect label="Product" options={opts.data?.products ?? []} value={product} onChange={setProduct} />
            <MultiSelect label="Category" options={opts.data?.categories ?? []} value={category} onChange={setCategory} />
            <Button onClick={() => setRun((n) => n + 1)} loading={r.isFetching}>Generate report</Button>
            {r.data && <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print / save PDF</Button>}
            <a href={downloadUrl("/api/complaints/export.csv", params)} className="h-9 px-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-sm font-medium hover:bg-surface-hover"><Download className="size-4" />Records CSV</a>
          </div>
        </Card>
      </div>
      {r.error && <Banner tone="bad">{(r.error as Error).message}</Banner>}
      {r.data && (
        <article className="bg-surface border border-line rounded-[var(--radius-card)] p-8 max-md:p-4 print:border-0 print:p-0">
          <header className="border-b border-line pb-4 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="overline text-muted">CauseLine report</p><h2 className="text-2xl font-semibold mt-1">{r.data.meta.title}</h2></div>
              {r.data.meta.synthetic_share ? <ProvenanceBadge kind="demo" label={`${fmtPct(r.data.meta.synthetic_share, 0)} synthetic data`} /> : null}
            </div>
            <dl className="mt-3 grid sm:grid-cols-3 gap-2 text-[12px] text-muted">
              <div>Generated <b className="text-ink-2">{fmtDateTime(r.data.meta.generated_at)}</b> by {r.data.meta.generated_by}</div>
              <div>Records in scope <b className="text-ink-2 num">{fmtInt(r.data.meta.records_in_scope)}</b></div>
              <div>Filters: {[from && `from ${from}`, to && `to ${to}`, product.length && `${product.length} products`, category.length && `${category.length} categories`].filter(Boolean).join(", ") || "none"}</div>
            </dl>
          </header>
          <Body r={r.data} />
          <footer className="mt-8 pt-4 border-t border-line text-[11px] text-muted">
            <div className="flex flex-wrap gap-1.5 mb-2">{PROVENANCE_LEGEND.slice(0, 3).map((k) => <ProvenanceBadge key={k} kind={k} />)}</div>
            All figures are computed from stored records with the rules shown. They contain no model predictions. {r.data.meta.synthetic_share ? "The data is synthetic demonstration data and does not describe real ABT CPD performance." : ""}
          </footer>
        </article>
      )}
    </>
  );
}

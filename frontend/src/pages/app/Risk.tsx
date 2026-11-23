import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Gauge } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { useUrlState } from "../../hooks/useUrlState";
import { useCapabilities } from "../../hooks/auth";
import type { Prediction } from "../../types/api";
import { Banner, Button, Card, EmptyState, Mono, PageHeader, Pill, type Tone } from "../../components/ui/primitives";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { Field, Input, SearchInput, Select } from "../../components/ui/forms";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { Sparkline } from "../../charts/charts";
import { fmtDate, fmtInt, fmtPct } from "../../utils/format";

const TIER: Record<string, Tone> = { High: "bad", Medium: "warn", Low: "neu" };
type ProductRow = { product_id: string; product_name: string; food_family: string | null; total: number; last_12m: number; prior_12m: number; change_pct: number | null; critical_last_12m: number; top_category_last_12m: string | null; monthly_24m: number[]; indicator: string };
type BatchRow = { batch_id: string; product_name: string; production_date: string | null; model_split: string; risk_score: number; risk_tier: string; actual_complaint_30d: boolean; top_risk_drivers: string | null; recommended_action: string | null };
type Options = { categorical_levels: Record<string, string[]>; tier_thresholds: { medium: number; high: number }; status: string; status_reason: string; metrics: Record<string, unknown>; limitations: string[] };

function Products() {
  const q = useQuery({ queryKey: ["products-monitor"], queryFn: () => api.get<{ rows: ProductRow[]; reference_date: string; reference_note: string | null; rule: string }>("/api/analytics/products") });
  const cols: Column<ProductRow>[] = [
    { key: "p", header: "Product", cell: (r) => <Link to={`/app/complaints?product=${encodeURIComponent(r.product_name)}`} onClick={(e) => e.stopPropagation()} className="text-link hover:underline">{r.product_name}</Link> },
    { key: "f", header: "Food family", hideBelow: "xl", cell: (r) => r.food_family },
    { key: "l", header: "Last 12 mo", align: "right", cell: (r) => fmtInt(r.last_12m) },
    { key: "pr", header: "Prior 12 mo", align: "right", hideBelow: "lg", cell: (r) => fmtInt(r.prior_12m) },
    { key: "c", header: "Change", align: "right", cell: (r) => r.change_pct === null ? "—" : <span className={r.change_pct > 25 ? "text-[var(--bad-fg)] font-medium" : ""}>{r.change_pct > 0 ? "+" : ""}{r.change_pct}%</span> },
    { key: "s", header: "24-month trend", hideBelow: "lg", cell: (r) => <Sparkline values={r.monthly_24m} label={`${r.product_name} monthly complaints`} /> },
    { key: "t", header: "Top category (12 mo)", hideBelow: "xl", cell: (r) => <span className="block max-w-48 truncate">{r.top_category_last_12m ?? "—"}</span> },
    { key: "i", header: "Indicator", cell: (r) => <Pill tone={r.indicator === "Rising" ? "bad" : r.indicator === "Falling" ? "ok" : "neu"}>{r.indicator}</Pill> },
  ];
  return (
    <Card title="Product-level monitoring" subtitle={q.data ? `Relative to ${fmtDate(q.data.reference_date)}. ${q.data.rule}${q.data.reference_note ? ` ${q.data.reference_note}` : ""}` : undefined} actions={<ProvenanceBadge kind="rule" />} bodyClass="p-0">
      <DataTable caption="Product monitoring" columns={cols} rows={q.data?.rows} rowKey={(r) => r.product_id} loading={q.isLoading} error={q.error}
        mobileCard={(r) => <div className="flex justify-between gap-2"><div className="min-w-0"><div className="truncate">{r.product_name}</div><div className="text-[12px] text-muted">{r.last_12m} in last 12 months</div></div><Pill tone={r.indicator === "Rising" ? "bad" : "neu"}>{r.indicator}</Pill></div>} />
    </Card>
  );
}

function HistoricalBatches() {
  const { get, set } = useUrlState();
  const tier = get("tier"), page = Number(get("page", "1"));
  const [q, setQ] = useState("");
  const r = useQuery({ queryKey: ["batches", tier, page, get("bq")], placeholderData: keepPreviousData,
    queryFn: () => api.get<{ items: BatchRow[]; total: number; tier_summary: { tier: string; batches: number; observed_complaint_rate: number }[]; basis: string; source_file: string }>("/api/risk/batches", { tier, page, page_size: 25, q: get("bq") }) });
  const cols: Column<BatchRow>[] = [
    { key: "b", header: "Batch", cell: (x) => <Mono className="text-[12px]">{x.batch_id}</Mono> },
    { key: "p", header: "Product", cell: (x) => <span className="block max-w-48 truncate">{x.product_name}</span> },
    { key: "d", header: "Produced", align: "right", hideBelow: "lg", cell: (x) => fmtDate(x.production_date) },
    { key: "t", header: "Tier", cell: (x) => <Pill tone={TIER[x.risk_tier]}>{x.risk_tier}</Pill> },
    { key: "s", header: "Score", align: "right", cell: (x) => x.risk_score.toFixed(3) },
    { key: "a", header: "Actual 30-day complaint", cell: (x) => <span className="inline-flex items-center gap-1.5">{x.actual_complaint_30d ? "Yes" : "No"}<ProvenanceBadge kind="recorded" label="Outcome" /></span> },
    { key: "dr", header: "Top factors (model)", hideBelow: "xl", cell: (x) => <span className="block max-w-80 truncate text-[12px] text-muted" title={x.top_risk_drivers ?? ""}>{x.top_risk_drivers ?? "—"}</span> },
  ];
  const summary = r.data?.tier_summary.sort((a, b) => ["High", "Medium", "Low"].indexOf(a.tier) - ["High", "Medium", "Low"].indexOf(b.tier));
  return (
    <Card title="Historical batch scores" subtitle={r.data?.basis} actions={<ProvenanceBadge kind="historical" />} bodyClass="p-0">
      <div className="px-4 pt-3 grid gap-3 sm:grid-cols-3">
        {summary?.map((s) => (
          <div key={s.tier} className="rounded-[var(--radius-card)] border border-line p-3">
            <div className="flex justify-between"><Pill tone={TIER[s.tier]}>{s.tier}</Pill><span className="num text-[13px]">{fmtInt(s.batches)} batches</span></div>
            <div className="mt-2 text-[12px] text-muted">Observed 30-day complaint rate</div><div className="num text-lg font-semibold">{fmtPct(s.observed_complaint_rate)}</div>
          </div>
        ))}
      </div>
      <div className="px-4 pt-2"><CountTabs label="Tier" value={tier || "all"} onChange={(t) => set({ tier: t === "all" ? null : t })} tabs={[{ id: "all", label: "All" }, { id: "High", label: "High" }, { id: "Medium", label: "Medium" }, { id: "Low", label: "Low" }]} /></div>
      <div className="p-4 border-b border-line"><form onSubmit={(e) => { e.preventDefault(); set({ bq: q }); }}><SearchInput value={q} onChange={setQ} placeholder="Batch ID or product (Enter)" className="w-72 max-md:w-full" /></form></div>
      <DataTable caption="Historical batch risk scores" columns={cols} rows={r.data?.items} rowKey={(x) => x.batch_id} loading={r.isLoading} error={r.error}
        mobileCard={(x) => <div className="flex justify-between"><div><Mono className="text-[12px]">{x.batch_id}</Mono><div className="text-[13px]">{x.product_name}</div></div><Pill tone={TIER[x.risk_tier]}>{x.risk_tier}</Pill></div>} />
      {r.data && <Pagination page={page} pageSize={25} total={r.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
    </Card>
  );
}

const NUM_FIELDS: [string, string, string?][] = [
  ["incoming_material_quality_score", "Incoming material quality score", "0–100"], ["process_deviation_count", "Process deviations"], ["final_inspection_pass_rate_pct", "Final inspection pass rate %", "0–100"],
  ["shelf_life_days", "Shelf life (days)"], ["remaining_shelf_life_days_at_dispatch", "Remaining shelf life at dispatch (days)"], ["storage_hours_before_dispatch", "Storage hours before dispatch"],
  ["prior_product_complaints_90d", "Product complaints, prior 90 days"], ["prior_food_family_complaints_90d", "Food-family complaints, prior 90 days"], ["prior_customer_complaints_90d", "Customer complaints, prior 90 days"],
  ["production_quantity_tonnes", "Production quantity (tonnes)"], ["target_storage_temp_min_c", "Target storage temp min °C"], ["target_storage_temp_max_c", "Target storage temp max °C"],
];

function ScoreBatch() {
  const opts = useQuery({ queryKey: ["batch-options"], queryFn: () => api.get<Options>("/api/ml/batch-risk/options") });
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Record<string, string>>();
  const m = useMutation({ mutationFn: (v: Record<string, unknown>) => api.post<Prediction>("/api/ml/batch-risk", v),
    onError: (e) => { if (e instanceof ApiError) e.fieldErrors.forEach((f) => setError(f.field, { message: f.message })); } });
  if (opts.error) return <Banner tone="warn" title="Batch risk model unavailable">{(opts.error as Error).message}</Banner>;
  const levels = opts.data?.categorical_levels ?? {};
  const res = m.data;
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-7" title="Score a batch" subtitle="All 27 inputs the model was trained on are required. Values the model did not see in training are flagged.">
        <form noValidate onSubmit={handleSubmit((v) => {
          const body: Record<string, unknown> = { ...v };
          NUM_FIELDS.forEach(([k]) => { body[k] = v[k] === "" ? null : Number(v[k]); });
          m.mutate(body);
        })} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch ID" optional htmlFor="batch_id"><Input id="batch_id" {...register("batch_id")} /></Field>
            <Field label="Product" optional htmlFor="product_name"><Input id="product_name" {...register("product_name")} /></Field>
            <Field label="Production date" required htmlFor="production_date" error={errors.production_date?.message}><Input id="production_date" type="date" {...register("production_date", { required: "Required" })} invalid={!!errors.production_date} /></Field>
            <Field label="Dispatch date" required htmlFor="dispatch_date" error={errors.dispatch_date?.message}><Input id="dispatch_date" type="date" {...register("dispatch_date", { required: "Required" })} invalid={!!errors.dispatch_date} /></Field>
          </div>
          <fieldset><legend className="overline text-muted mb-2">Process & product measurements</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NUM_FIELDS.map(([k, label, help]) => (
                <Field key={k} label={label} required htmlFor={k} help={help} error={errors[k]?.message}>
                  <Input id={k} inputMode="decimal" invalid={!!errors[k]} {...register(k, { required: "Required", pattern: { value: /^-?\d+(\.\d+)?$/, message: "Number" } })} />
                </Field>
              ))}
            </div>
          </fieldset>
          <fieldset><legend className="overline text-muted mb-2">Categorical attributes</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(levels).map(([k, vals]) => (
                <Field key={k} label={k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} required htmlFor={k} error={errors[k]?.message}>
                  <Select id={k} placeholder="Select…" options={vals} invalid={!!errors[k]} {...register(k, { required: "Required" })} />
                </Field>
              ))}
            </div>
          </fieldset>
          <Button type="submit" loading={m.isPending} icon={<Gauge className="size-4" />}>Score batch</Button>
        </form>
      </Card>
      <div className="xl:col-span-5 space-y-4">
        {opts.data && <Banner tone="warn" title="Weak predictive signal">Test ROC-AUC {String(opts.data.metrics.test_roc_auc)} (95% CI {String(opts.data.metrics.test_roc_auc_95ci)}). The High tier held 1.5× the average complaint rate in testing. Use tiers to prioritise extra checks - never as a release or hold decision.</Banner>}
        {res ? (
          <section className="rounded-[var(--radius-card)] border-2 border-dashed bg-surface p-4" style={{ borderColor: "var(--pv-model-bd)" }} aria-label="Batch risk result">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="font-semibold">Batch risk result</h3><ProvenanceBadge kind="model" /></div><Mono className="text-[11px] text-muted">{res.reference}</Mono></div>
            <div className="text-[12px] text-muted">{res.model.name} v{res.model.version}</div>
            {res.status !== "completed" ? <Banner tone="warn" className="mt-3">{res.message}</Banner> : (
              <>
                <div className="mt-3 flex items-end gap-4">
                  <div><div className="text-[12px] text-muted">Risk tier</div><Pill tone={TIER[res.output!.risk_tier]} className="text-[14px] h-7 px-3">{res.output!.risk_tier}</Pill></div>
                  <div><div className="text-[12px] text-muted">Score (uncalibrated)</div><div className="num text-lg font-semibold">{res.output!.risk_score.toFixed(3)}</div></div>
                </div>
                <p className="text-[12px] text-muted mt-1">Tier cut-offs: Medium ≥ {opts.data?.tier_thresholds.medium.toFixed(3)}, High ≥ {opts.data?.tier_thresholds.high.toFixed(3)} (validation-set 70th/90th percentiles).</p>
                {(res.output!.warnings ?? []).map((w: string) => <p key={w} className="text-[12px] text-[var(--warn-fg)] mt-1">{w}</p>)}
                <div className="mt-3"><div className="text-[13px] font-semibold mb-1">Largest factors (log-odds contribution)</div>
                  <ul className="space-y-1 text-[13px]">{res.output!.factors.map((f: { feature: string; value: number | string; contribution: number; direction: string; basis: string }) => (
                    <li key={f.feature} className="flex justify-between gap-2" title={f.basis}><span className="min-w-0 truncate">{f.feature.replace(/_/g, " ")} = <b>{String(f.value)}</b></span><span className={`num shrink-0 ${f.contribution > 0 ? "text-[var(--bad-fg)]" : "text-[var(--ok-fg)]"}`}>{f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(2)}</span></li>
                  ))}</ul>
                  <p className="text-[11px] text-muted mt-1">Exact decomposition of the logistic regression: numeric factors relative to the training mean, categorical relative to the average level.</p>
                </div>
              </>
            )}
          </section>
        ) : <Card><EmptyState icon={<Gauge className="size-7" />} title="No batch scored yet">The result shows the tier, the uncalibrated score and the factors that moved it.</EmptyState></Card>}
      </div>
    </div>
  );
}

type RepeatBatch = { batch_id: string; product_name: string; complaints: number; categories: number; top_category: string | null; severity_weighted: number;
  critical: number; food_safety_related: number; first: string; last: string; span_days: number };
type RepeatResp = { items: RepeatBatch[]; total: number; rule: string;
  summary: { batches_with_complaints: number; recurring_batches: number; complaints_with_batch: number; complaints_total: number; max_complaints_single_batch: number } };

function RepeatBatches() {
  const { get, set } = useUrlState();
  const page = Number(get("page", "1")), sort = get("sort", "complaints"), order = get("order", "desc") as "asc" | "desc";
  const [q, setQ] = useState(get("q"));
  const r = useQuery({ queryKey: ["repeat-batches", page, sort, order, get("q")], placeholderData: keepPreviousData,
    queryFn: () => api.get<RepeatResp>("/api/risk/recurring-batches", { page, page_size: 25, sort, order, q: get("q") }) });
  const s = r.data?.summary;
  const cols: Column<RepeatBatch>[] = [
    { key: "b", header: "Batch", sortKey: "batch_id", cell: (x) => <Link to={`/app/complaints?q=${encodeURIComponent(x.batch_id)}`} className="font-mono text-[12px] text-link hover:underline">{x.batch_id}</Link> },
    { key: "p", header: "Product", cell: (x) => <span className="block max-w-48 truncate" title={x.product_name}>{x.product_name}</span> },
    { key: "n", header: "Complaints", sortKey: "complaints", align: "right", cell: (x) => <b className="num">{x.complaints}</b> },
    { key: "c", header: "Top category", hideBelow: "lg", cell: (x) => <span className="block max-w-48 truncate" title={x.top_category ?? ""}>{x.top_category ?? "—"}{x.categories > 1 && <span className="text-muted"> +{x.categories - 1}</span>}</span> },
    { key: "cr", header: "Critical", sortKey: "critical", align: "right", hideBelow: "xl", cell: (x) => x.critical || <span className="text-faint">0</span> },
    { key: "fs", header: "Food-safety", align: "right", hideBelow: "xl", cell: (x) => x.food_safety_related || <span className="text-faint">0</span> },
    { key: "span", header: "Within", align: "right", hideBelow: "lg", cell: (x) => `${x.span_days} days` },
    { key: "l", header: "Last complaint", sortKey: "last", align: "right", cell: (x) => fmtDate(x.last) },
  ];
  return (
    <Card title="Batches with repeat complaints" subtitle={r.data ? `${fmtInt(s?.recurring_batches)} of ${fmtInt(s?.batches_with_complaints)} complained-about batches have 2 or more complaints. ${fmtInt(s?.complaints_with_batch)} of ${fmtInt(s?.complaints_total)} complaints carry a batch number. ${r.data.rule}` : undefined}
      actions={<ProvenanceBadge kind="recorded" />} bodyClass="p-0">
      <div className="p-4 border-b border-line"><form onSubmit={(e) => { e.preventDefault(); set({ q }); }}><SearchInput value={q} onChange={setQ} placeholder="Batch or product (press Enter)" className="w-80 max-md:w-full" label="Search batches" /></form></div>
      <DataTable caption="Batches with repeat complaints" columns={cols} rows={r.data?.items} rowKey={(x) => x.batch_id} loading={r.isLoading} error={r.error} onRetry={() => r.refetch()}
        sort={{ key: sort, order }} onSort={(k) => set({ sort: k, order: sort === k && order === "desc" ? "asc" : "desc" })}
        mobileCard={(x) => <div className="space-y-0.5"><div className="flex justify-between gap-2"><Mono className="text-[12px] text-link">{x.batch_id}</Mono><b className="text-[13px] num">{x.complaints} complaints</b></div><div className="text-[13px] truncate">{x.product_name}</div><div className="text-[12px] text-muted">{x.top_category} · within {x.span_days} days · last {fmtDate(x.last)}</div></div>} />
      {r.data && <Pagination page={page} pageSize={25} total={r.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
    </Card>
  );
}

export default function Risk() {
  const { get, set } = useUrlState();
  const { data: caps } = useCapabilities();
  const batch = caps?.modules.risk_level === "batch";
  const tab = get("tab", "products");
  return (
    <>
      <PageHeader title={batch ? "Product & batch risk" : "Product risk"} description="Risk is estimated at the level stated on each section. Batch tiers come from the supplied model; product monitoring is a rule-based trend." />
      <SyntheticNotice what="Product trends and historical batch scores" />
      <Banner tone="info" className="mb-4" title="Level of estimation">
        Product monitoring compares complaint counts per product (rule-based). Repeat-complaint batches count recorded batch numbers on complaints. Batch scores use the supplied 30-day batch model, which uses only information available before dispatch.
        {" "}Batch records themselves are not stored yet - {caps?.missing_datasets[0] ?? "the batch dataset"} has not been supplied.
      </Banner>
      <div className="mb-4"><CountTabs label="Risk sections" value={tab} onChange={(t) => set({ tab: t, tier: null, q: null, sort: null, order: null })} tabs={[{ id: "products", label: "Product monitoring" }, { id: "repeat", label: "Repeat-complaint batches" }, ...(batch ? [{ id: "history", label: "Historical batch scores" }, { id: "score", label: "Score a batch" }] : [])]} /></div>
      {tab === "history" && batch ? <HistoricalBatches /> : tab === "score" && batch ? <ScoreBatch /> : tab === "repeat" ? <RepeatBatches /> : <Products />}
    </>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Cpu } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useUrlState } from "../../hooks/useUrlState";
import { useAuth } from "../../hooks/auth";
import type { AnalysisRun, Prediction } from "../../types/api";
import { Banner, Button, Card, EmptyState, Mono, PageHeader, Pill } from "../../components/ui/primitives";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { Field, Select, Textarea } from "../../components/ui/forms";
import { Drawer } from "../../components/ui/overlays";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { AnalysisResult, ReviewActions, ReviewStatus } from "../../components/domain/AnalysisResult";
import { fmtDateTime, fmtInt } from "../../utils/format";

type ModelsResp = { models: { model_key: string; name: string; version: string; status: string; status_reason: string | null; last_validated_at: string | null }[] };
const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info"> = { ready: "ok", degraded: "warn", blocked: "bad", loading: "info" };

function ModelStrip() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["models"], queryFn: () => api.get<ModelsResp>("/api/ml/models"), refetchInterval: (d) => (d.state.data?.models.some((m) => m.status === "loading") ? 4000 : false) });
  return (
    <div className="flex flex-wrap gap-2 mb-5" aria-label="Model status">
      {q.data?.models.map((m) => (
        <span key={m.model_key} title={m.status_reason ?? undefined} className="inline-flex items-center gap-2 h-8 px-3 rounded-[var(--radius-control)] border border-line bg-surface text-[12px]">
          <Cpu className="size-3.5 text-muted" />{m.name}<Mono className="text-[11px] text-muted">v{m.version}</Mono>
          <Pill tone={STATUS_TONE[m.status] ?? "neu"}>{m.status}</Pill>
        </span>
      ))}
      {user?.role === "admin" && <Link to="/app/admin/models" className="h-8 inline-flex items-center text-[12px] text-link hover:underline px-1">Model registry →</Link>}
    </div>
  );
}

function AnalyseText() {
  const [text, setText] = useState("");
  const [cat, setCat] = useState("");
  const [fam, setFam] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const opts = useQuery({ queryKey: ["complaint-filters"], queryFn: () => api.get<{ categories: string[]; food_families: string[] }>("/api/complaints/filters"), staleTime: 300_000 });
  const m = useMutation({ mutationFn: () => api.post<AnalysisRun>("/api/ml/analyze/text", { text, complaint_category: cat || null, food_family: fam || null }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Analysis failed") });
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-5 self-start" title="Complaint text" subtitle="Ad-hoc analysis - not saved as a complaint, but every model output is stored for audit.">
        <form noValidate onSubmit={(e) => { e.preventDefault(); setErr(null); if (clean.length < 3) return setErr("Enter complaint text containing letters or numbers."); m.mutate(); }} className="space-y-4">
          <Field label="Description" required htmlFor="ai-text" error={err ?? undefined} help={`${text.length}/5000 characters. Free-form wording is supported, but the models were trained on templated synthetic text.`}>
            <Textarea id="ai-text" rows={8} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} invalid={!!err} placeholder="e.g. Customer found a hard plastic fragment inside a sealed yoghurt cup." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recorded category" optional htmlFor="ai-cat" help="Required for root-cause hypotheses"><Select id="ai-cat" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Not determined" options={opts.data?.categories ?? []} /></Field>
            <Field label="Food family" optional htmlFor="ai-fam"><Select id="ai-fam" value={fam} onChange={(e) => setFam(e.target.value)} placeholder="Not specified" options={opts.data?.food_families ?? []} /></Field>
          </div>
          <Button type="submit" loading={m.isPending} icon={<BrainCircuit className="size-4" />}>Analyse</Button>
        </form>
      </Card>
      <div className="xl:col-span-7 min-w-0">
        {m.data ? <AnalysisResult run={m.data} /> : (
          <Card><EmptyState icon={<BrainCircuit className="size-7" />} title="No analysis yet">Results appear here with the model name and version, a ranked shortlist, uncertainty, similar historical complaints and known limitations.</EmptyState></Card>
        )}
      </div>
    </div>
  );
}

function ReviewQueue() {
  const { get, set } = useUrlState();
  const status = get("rs", "pending"), page = Number(get("page", "1"));
  const [open, setOpen] = useState<Prediction | null>(null);
  const q = useQuery({ queryKey: ["predictions", status, page], placeholderData: keepPreviousData,
    queryFn: () => api.get<{ items: Prediction[]; total: number }>("/api/ml/predictions", { review_status: status, page, page_size: 25 }) });
  const cols: Column<Prediction>[] = [
    { key: "ref", header: "Prediction", cell: (p) => <Mono className="text-[12px]">{p.reference}</Mono> },
    { key: "subject", header: "Subject", cell: (p) => p.complaint_id ? <Link to={`/app/complaints/${p.complaint_id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-link hover:underline">{p.complaint_id}</Link> : <span className="text-muted">Ad-hoc text</span> },
    { key: "model", header: "Model", cell: (p) => <span className="whitespace-nowrap">{p.model.name} <Mono className="text-[11px] text-muted">v{p.model.version}</Mono></span> },
    { key: "label", header: "Predicted", cell: (p) => <span className="block max-w-72 truncate" title={p.top_label ?? ""}>{p.top_label}</span> },
    { key: "score", header: "Score", align: "right", cell: (p) => p.top_score !== null ? <span className={p.low_confidence ? "text-[var(--warn-fg)]" : ""}>{p.top_score.toFixed(2)}{p.low_confidence ? " · low" : ""}</span> : "—" },
    { key: "review", header: "Review", cell: (p) => <ReviewStatus p={p} /> },
    { key: "at", header: "Created", align: "right", hideBelow: "lg", cell: (p) => fmtDateTime(p.created_at) },
  ];
  return (
    <Card bodyClass="p-0">
      <div className="px-4 pt-2"><CountTabs label="Review status" value={status} onChange={(s) => set({ rs: s })} tabs={[{ id: "pending", label: "Awaiting review" }, { id: "confirmed", label: "Confirmed" }, { id: "corrected", label: "Corrected" }, { id: "rejected", label: "Rejected" }]} /></div>
      <DataTable caption="Predictions" columns={cols} rows={q.data?.items} rowKey={(p) => p.id} loading={q.isLoading} error={q.error} onRowClick={setOpen}
        empty={<EmptyState title={status === "pending" ? "Nothing awaiting review" : "No predictions in this state"}>Classifier and root-cause outputs that need a human decision appear here.</EmptyState>}
        mobileCard={(p) => <div><div className="flex justify-between"><Mono className="text-[12px]">{p.reference}</Mono><ReviewStatus p={p} /></div><div className="text-[13px] truncate">{p.top_label}</div><div className="text-[12px] text-muted">{p.model.name}</div></div>} />
      {q.data && <Pagination page={page} pageSize={25} total={q.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `Review ${open.reference}` : ""}>
        {open && (
          <div className="space-y-4 text-[13px]">
            <div className="flex flex-wrap gap-2"><ProvenanceBadge kind={open.model.key === "root-cause" ? "model" : "nlp"} /><ReviewStatus p={open} /></div>
            <div><div className="text-[12px] text-muted">Model</div>{open.model.name} v{open.model.version}</div>
            <div><div className="text-[12px] text-muted">Input text</div><p className="whitespace-pre-wrap text-ink-2 bg-surface-2 rounded p-2 mt-1 max-h-48 overflow-auto">{String(open.input.text ?? open.input.complaint_description ?? "")}</p></div>
            <div><div className="text-[12px] text-muted">Prediction</div><div className="font-semibold text-base">{open.top_label}</div><div className="text-muted">Score {open.top_score?.toFixed(2)} (uncalibrated)</div></div>
            {open.output?.predictions && <div><div className="text-[12px] text-muted mb-1">Shortlist</div><ol className="space-y-0.5">{open.output.predictions.map((c: { label: string; probability: number }, i: number) => <li key={c.label} className="flex justify-between"><span>{i + 1}. {c.label}</span><span className="num">{c.probability.toFixed(2)}</span></li>)}</ol></div>}
            {open.output?.hypotheses && <div><div className="text-[12px] text-muted mb-1">Hypotheses (not confirmed)</div><ol>{open.output.hypotheses.map((h: { cause: string; probability: number }, i: number) => <li key={h.cause} className="flex justify-between"><span>{i + 1}. {h.cause}</span><span className="num">{h.probability.toFixed(2)}</span></li>)}</ol></div>}
            {open.low_confidence && <Banner tone="warn" title="Low confidence">Classify manually using the shortlist as a guide.</Banner>}
            {open.reviews.map((r, i) => <div key={i} className="rounded border border-line p-2 text-[12px]"><b>{r.action}</b> by {r.reviewer} · {fmtDateTime(r.created_at)}{r.corrected_label && <> → {r.corrected_label}</>}{r.reason && <div className="text-muted">{r.reason}</div>}</div>)}
            <ReviewActions p={open} onDone={() => setOpen(null)} />
          </div>
        )}
      </Drawer>
    </Card>
  );
}

export default function AiAnalysis() {
  const { get, set } = useUrlState();
  const tab = get("tab", "analyse");
  const pending = useQuery({ queryKey: ["predictions-count"], queryFn: () => api.get<{ total: number }>("/api/ml/predictions", { review_status: "pending", page_size: 1 }) });
  return (
    <>
      <PageHeader title="AI analysis" description="Run the registered NLP models on complaint text and review their outputs. Predictions are never applied without a human decision." />
      <ModelStrip />
      <div className="mb-4"><CountTabs label="AI analysis sections" value={tab} onChange={(t) => set({ tab: t, rs: null })} tabs={[{ id: "analyse", label: "Analyse text" }, { id: "queue", label: "Review queue", count: pending.data?.total }]} /></div>
      {tab === "queue" ? <ReviewQueue /> : <AnalyseText />}
      <p className="mt-4 text-[12px] text-muted">{fmtInt(pending.data?.total)} predictions currently await review.</p>
    </>
  );
}

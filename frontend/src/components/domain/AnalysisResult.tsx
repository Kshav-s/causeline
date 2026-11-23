import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, ChevronDown, ShieldAlert, ThumbsDown, PencilLine, Check } from "lucide-react";
import { api, ApiError } from "../../services/api";
import type { AnalysisRun, Prediction } from "../../types/api";
import { ProvenanceBadge } from "../ui/ProvenanceBadge";
import { Banner, Button, InsufficientData, Mono, Pill } from "../ui/primitives";
import { Field, Select, Textarea } from "../ui/forms";
import { Modal } from "../ui/overlays";
import { useToast } from "../ui/overlays";
import { cx, fmtDate, fmtDateTime } from "../../utils/format";

function confidenceWord(p: number) {
  return p >= 0.75 ? "Higher" : p >= 0.5 ? "Moderate" : p >= 0.3 ? "Low" : "Very low";
}

export function ReviewStatus({ p }: { p: Prediction }) {
  if (p.review_status === "not_applicable") return null;
  if (p.review_status === "pending") return <Pill tone="warn">Awaiting human review</Pill>;
  const last = p.reviews[p.reviews.length - 1];
  if (p.review_status === "rejected") return <Pill tone="bad" icon={<ThumbsDown className="size-3" />}>Rejected by {last?.reviewer}</Pill>;
  return <ProvenanceBadge kind="human" label={p.review_status === "corrected" ? `Corrected to "${last?.corrected_label}"` : `Confirmed by ${last?.reviewer}`} />;
}

function ModelLine({ p }: { p: Prediction }) {
  return (
    <div className="text-[12px] text-muted flex flex-wrap gap-x-3 gap-y-1">
      <span>{p.model.name} <Mono className="text-[11px]">v{p.model.version}</Mono></span>
      <span><Mono className="text-[11px]">{p.reference}</Mono></span>
      <span>{fmtDateTime(p.created_at)}</span>
    </div>
  );
}

function Limitations({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button className="flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />Limitations of this model
      </button>
      {open && <ul className="mt-2 space-y-1 text-[12px] text-ink-2 list-disc pl-5">{items.map((l) => <li key={l}>{l}</li>)}</ul>}
    </div>
  );
}

export function ReviewActions({ p, onDone }: { p: Prediction; onDone?: () => void }) {
  const [mode, setMode] = useState<null | "rejected" | "corrected">(null);
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels", p.model.key], queryFn: () => api.get<{ labels: string[] }>(`/api/ml/labels/${p.model.key}`), enabled: mode === "corrected" });
  const m = useMutation({
    mutationFn: (body: { action: string; corrected_label?: string; reason?: string }) => api.post<Prediction>(`/api/ml/predictions/${p.reference}/review`, body),
    onSuccess: () => { toast("ok", "Review recorded"); setMode(null); qc.invalidateQueries(); onDone?.(); },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Review failed"),
  });
  if (p.review_status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} loading={m.isPending && !mode} onClick={() => m.mutate({ action: "confirmed" })}>Confirm</Button>
      <Button size="sm" variant="secondary" icon={<PencilLine className="size-3.5" />} onClick={() => { setErr(null); setMode("corrected"); }}>Correct…</Button>
      <Button size="sm" variant="ghost" icon={<ThumbsDown className="size-3.5" />} onClick={() => { setErr(null); setMode("rejected"); }}>Reject…</Button>
      <Modal open={!!mode} onOpenChange={(o) => !o && setMode(null)} title={mode === "corrected" ? "Correct the prediction" : "Reject the prediction"}
        description={`${p.model.name} predicted "${p.top_label}". Your review is stored with your name and kept alongside the original output.`}
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button>
          <Button variant={mode === "rejected" ? "danger" : "primary"} loading={m.isPending} onClick={() => {
            if (mode === "corrected" && !label) return setErr("Choose the correct label.");
            if (reason.trim().length < 3) return setErr("Give a short reason.");
            m.mutate({ action: mode!, corrected_label: mode === "corrected" ? label : undefined, reason });
          }}>{mode === "corrected" ? "Save correction" : "Reject"}</Button></>}>
        <div className="space-y-3">
          {mode === "corrected" && (
            <Field label="Correct label" required htmlFor="rv-label">
              <Select id="rv-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={labels.isLoading ? "Loading…" : "Select…"} options={labels.data?.labels ?? []} />
            </Field>
          )}
          <Field label="Reason" required htmlFor="rv-reason" error={err ?? undefined}>
            <Textarea id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Investigation found an odour complaint, not foreign matter." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Shortlist({ preds }: { preds: { label: string; probability: number }[] }) {
  return (
    <ol className="space-y-2">
      {preds.map((c, i) => (
        <li key={c.label}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className={cx("min-w-0", i === 0 ? "font-semibold text-ink" : "text-ink-2")}>{i + 1}. {c.label}</span>
            <span className="num text-ink-2">{c.probability.toFixed(2)}</span>
          </div>
          <div className="h-1.5 mt-1 rounded-full bg-surface-hover overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.probability * 100}%`, background: "var(--pv-nlp-fg)" }} /></div>
        </li>
      ))}
    </ol>
  );
}

function Panel({ kind, title, p, children }: { kind: "nlp" | "model" | "similarity" | "rule"; title: string; p: Prediction; children: React.ReactNode }) {
  const machine = kind !== "rule";
  return (
    <section className={cx("rounded-[var(--radius-card)] border-2 bg-surface p-4", machine ? "border-dashed" : "border-solid")}
      style={{ borderColor: `var(--pv-${kind === "similarity" ? "sim" : kind}-bd)` }} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-ink">{title}</h4><ProvenanceBadge kind={kind} /></div><ModelLine p={p} /></div>
        <ReviewStatus p={p} />
      </div>
      {children}
    </section>
  );
}

function Unavailable({ p, what }: { p: Prediction; what: string }) {
  if (p.status === "insufficient_data") return <InsufficientData title={`${what}: insufficient data`}>{p.message}</InsufficientData>;
  return <Banner tone="warn" title={`${what} unavailable`}>{p.message}</Banner>;
}

export function AnalysisResult({ run, showInput = true }: { run: AnalysisRun; showInput?: boolean }) {
  const P = run.predictions;
  const cat = P["nlp-category"], sub = P["nlp-subcategory"], safety = P["food-safety-flag"], sim = P["nlp-similarity"], rc = P["root-cause"];
  const escalate = safety?.output?.escalate_for_food_safety_review;
  const thr = cat?.model.low_confidence_threshold ?? 0.5;
  const next = !cat || cat.status !== "completed"
    ? "Add a fuller complaint description, then run the analysis again."
    : cat.low_confidence
      ? "The model is uncertain. Classify this complaint manually, using the shortlist and similar cases as evidence, then record your decision below."
      : "Compare against the similar historical complaints, then confirm or correct the category below.";
  return (
    <div className="space-y-4">
      {showInput && cat && (
        <div className="rounded-[var(--radius-card)] bg-surface-2 border border-line p-3">
          <div className="flex items-center gap-2 mb-1"><span className="overline text-muted">Submitted text</span><ProvenanceBadge kind="recorded" label="Input" /></div>
          <p className="text-[13px] text-ink-2 whitespace-pre-wrap line-clamp-6">{String(cat.input.text ?? "")}</p>
        </div>
      )}
      {safety?.status === "completed" && (
        escalate ? (
          <Banner tone="bad" title="Escalate for food-safety review (rule-based flag)">
            Triggered by {safety.output!.reason_keywords.length ? <>keywords <b>{safety.output!.reason_keywords.join(", ")}</b></> : null}
            {safety.output!.reason_keywords.length && safety.output!.reason_category_in_safety_bucket ? " and " : ""}
            {safety.output!.reason_category_in_safety_bucket ? "the predicted category being a food-safety category" : ""}. This is a keyword heuristic, not a food-safety determination - a qualified person must review.
          </Banner>
        ) : <Banner tone="info" title="No food-safety keyword trigger (rule-based)">Absence of a trigger does not mean the complaint is safe - it only means no listed keyword or safety category matched.</Banner>
      )}

      {cat && (
        <Panel kind="nlp" title="Complaint category" p={cat}>
          {cat.status !== "completed" ? <Unavailable p={cat} what="Classification" /> : (
            <>
              {cat.low_confidence && (
                <Banner tone="warn" className="mb-3" title="Uncertain prediction - manual classification recommended">
                  Top score {cat.top_score?.toFixed(2)} is below the {thr} threshold set for this model.
                </Banner>
              )}
              {(cat.output?.warnings ?? []).map((w: string) => <p key={w} className="text-[12px] mb-2 flex gap-1 text-[var(--warn-fg)]"><AlertTriangle className="size-3.5 mt-px" />{w}</p>)}
              <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <div>
                  <div className="text-[12px] text-muted">Predicted category</div>
                  <div className="text-lg font-semibold text-ink leading-7">{cat.top_label}</div>
                  <div className="text-[12px] text-muted mt-1">Score {cat.top_score?.toFixed(2)} · <b className="text-ink-2">{confidenceWord(cat.top_score ?? 0)}</b> confidence · uncalibrated, use as a ranking</div>
                </div>
                <div><div className="text-[12px] text-muted mb-1.5">Ranked shortlist</div><Shortlist preds={cat.output!.predictions} /></div>
              </div>
              {sub?.status === "completed" && (
                <div className="mt-3 border-t border-line pt-3 text-[13px]">
                  <span className="text-muted">Defect subcategory (model {sub.model.version}): </span><span className="text-ink">{sub.top_label}</span>
                  <span className="text-muted num"> · score {sub.top_score?.toFixed(2)}</span>
                </div>
              )}
              <ReviewActions p={cat} />
              <Limitations items={cat.model.limitations} />
            </>
          )}
        </Panel>
      )}

      {rc && (
        <Panel kind="model" title="Possible root causes" p={rc}>
          {rc.status !== "completed" ? <Unavailable p={rc} what="Root-cause hypotheses" /> : (
            <>
              <p className="text-[12px] text-muted mb-2">Possible explanations to direct the investigation - <b>not</b> a confirmed root cause.</p>
              {rc.low_confidence && <Banner tone="warn" className="mb-2" title="Low support">The leading hypothesis has a low score; treat all three as equally open.</Banner>}
              {(rc.output?.warnings ?? []).map((w: string) => <p key={w} className="text-[12px] mb-2 text-[var(--warn-fg)]">{w}</p>)}
              <ol className="space-y-1.5">
                {rc.output!.hypotheses.map((h: { cause: string; probability: number }, i: number) => (
                  <li key={h.cause} className="flex justify-between gap-3 text-[13px]"><span className={i === 0 ? "font-medium" : "text-ink-2"}>{i + 1}. {h.cause}</span><span className="num text-muted">{h.probability.toFixed(2)}</span></li>
                ))}
              </ol>
              <ReviewActions p={rc} />
              <Limitations items={rc.model.limitations} />
            </>
          )}
        </Panel>
      )}

      {sim && (
        <Panel kind="similarity" title="Similar historical complaints" p={sim}>
          {sim.status !== "completed" ? <Unavailable p={sim} what="Similarity search" /> : (
            <>
              <p className="text-[12px] text-muted mb-2">Cosine similarity of sentence embeddings (0–1). Similar wording is evidence to compare, not proof of the same cause.</p>
              <ul className="divide-y divide-line">
                {sim.output!.results.map((r: { complaint_id: string; complaint_received_date: string; complaint_category: string; product_name: string; complaint_summary: string; similarity: number }) => (
                  <li key={r.complaint_id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/app/complaints/${r.complaint_id}`} className="font-mono text-[12px] text-link hover:underline">{r.complaint_id}</Link>
                      <span className="text-[12px] text-muted"> · {fmtDate(r.complaint_received_date)} · {r.product_name}</span>
                      <div className="text-[13px] text-ink-2 truncate">{r.complaint_summary}</div>
                      <div className="text-[12px] text-muted">Recorded category: {r.complaint_category}</div>
                    </div>
                    <span className="num text-[13px] font-medium shrink-0">{r.similarity.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <Limitations items={sim.model.limitations} />
            </>
          )}
        </Panel>
      )}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="flex items-center gap-2 mb-1"><ShieldAlert className="size-4 text-link" /><h4 className="font-semibold">Recommended next step</h4></div>
        <p className="text-[13px] text-ink-2">{next}</p>
        {cat?.review_status !== "pending" && cat?.review_status !== "not_applicable" && <p className="text-[12px] text-muted mt-2 flex items-center gap-1"><BadgeCheck className="size-3.5" />Category review recorded.</p>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Pencil, ShieldAlert } from "lucide-react";
import { api, ApiError } from "../../services/api";
import type { AnalysisRun, Complaint } from "../../types/api";
import { Banner, Button, Card, ErrorState, KeyValue, Mono, PageHeader, Pill, SeverityPill, Skeleton, StatusPill } from "../../components/ui/primitives";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { Stepper } from "../../components/ui/Stepper";
import { Field, Input, Select, Textarea } from "../../components/ui/forms";
import { Modal, useToast } from "../../components/ui/overlays";
import { AnalysisResult, ReviewStatus } from "../../components/domain/AnalysisResult";
import { cx, fmtDate, fmtDateTime } from "../../utils/format";

type Attachment = { id: number; filename: string; content_type: string; size_bytes: number; width: number | null; height: number | null; sha256: string; created_at: string };
type Detail = { complaint: Complaint; extra: Record<string, string>; historical_root_cause_hypotheses: { cause: string; probability: number }[] | null; linked_capas: string[]; recurrence_of_capa: string | null;
  submitter: { name: string | null; organisation: string | null; email: string | null; additional_info: string | null } | null; analysis_status: string | null;
  root_cause_confirmation: { by: string | null; at: string } | null; attachments: Attachment[] };

function ConfirmCauseDialog({ c, open, onOpenChange }: { c: Complaint; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const labels = useQuery({ queryKey: ["labels", "root-cause"], queryFn: () => api.get<{ labels: string[] }>("/api/ml/labels/root-cause"), enabled: open });
  const [cause, setCause] = useState(c.root_cause_category ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.patch(`/api/complaints/${c.complaint_id}`, { root_cause_category: cause, root_cause_status: "Confirmed", investigation_status: "Completed", change_reason: reason }),
    onSuccess: () => { toast("ok", "Confirmed root cause recorded"); qc.invalidateQueries(); onOpenChange(false); },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Could not save"),
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record confirmed root cause" description="Record the cause established by your investigation. Model hypotheses are never converted automatically; this is stored as a human-verified finding with your name."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={() => {
        if (!cause) return setErr("Choose the confirmed cause");
        if (reason.trim().length < 3) return setErr("Summarise the evidence");
        m.mutate();
      }}>Record as confirmed</Button></>}>
      <div className="space-y-3">
        {err && <Banner tone="bad">{err}</Banner>}
        <Field label="Confirmed root cause" required htmlFor="cc-cause"><Select id="cc-cause" value={cause} onChange={(e) => setCause(e.target.value)} placeholder={labels.isLoading ? "Loading..." : "Select..."} options={labels.data?.labels ?? []} /></Field>
        <Field label="Evidence" required htmlFor="cc-reason" help="e.g. retained sample analysis, supplier lot test, line records"><Textarea id="cc-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function NotesPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const notes = useQuery({ queryKey: ["notes", id], queryFn: () => api.get<{ items: { id: number; note: string; author: string; created_at: string }[] }>(`/api/complaints/${encodeURIComponent(id)}/notes`) });
  const add = useMutation({ mutationFn: () => api.post(`/api/complaints/${encodeURIComponent(id)}/notes`, { note }), onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["notes", id] }); qc.invalidateQueries({ queryKey: ["activity", id] }); } });
  return (
    <div className="space-y-3">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 3) add.mutate(); }}>
        <label htmlFor="new-note" className="sr-only">New investigation note</label>
        <Textarea id="new-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note (visible to staff only)" />
        <Button size="sm" type="submit" loading={add.isPending} disabled={note.trim().length < 3}>Add note</Button>
      </form>
      {notes.data?.items.length ? (
        <ul className="divide-y divide-line">{notes.data.items.map((n) => <li key={n.id} className="py-2.5 text-[13px]"><div className="whitespace-pre-wrap">{n.note}</div><div className="text-[11px] text-muted mt-1">{n.author} · {fmtDateTime(n.created_at)}</div></li>)}</ul>
      ) : <p className="text-[13px] text-muted">No investigation notes yet.</p>}
    </div>
  );
}

function ActivityPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["activity", id], queryFn: () => api.get<{ items: { at: string; action: string; by: string; details: Record<string, unknown> | null }[] }>(`/api/complaints/${encodeURIComponent(id)}/activity`) });
  const LABEL: Record<string, string> = { "complaint.public_submit": "Submitted on the public form", "complaint.create": "Created by staff", "complaint.update": "Updated", "complaint.note": "Investigation note added",
    "ml.analyze": "AI analysis run", "prediction.confirmed": "AI suggestion confirmed", "prediction.corrected": "AI suggestion corrected", "prediction.rejected": "AI suggestion rejected", "complaint.imported": "Imported from file" };
  if (!q.data?.items.length) return <p className="text-[13px] text-muted">No activity recorded.</p>;
  return (
    <ol className="relative border-l border-line ml-2 space-y-3">
      {q.data.items.map((a, i) => (
        <li key={i} className="ml-4 text-[13px]">
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-petrol-500" aria-hidden />
          <div className="font-medium">{LABEL[a.action] ?? a.action}</div>
          <div className="text-[11px] text-muted">{fmtDateTime(a.at)} · {a.by}</div>
          {a.action === "complaint.update" && a.details?.changes ? <div className="text-[12px] text-muted mt-0.5">{Object.keys(a.details.changes as object).join(", ")}{a.details.reason ? ` - "${String(a.details.reason)}"` : ""}</div> : null}
        </li>
      ))}
    </ol>
  );
}
const STEPS = ["Received", "Triage", "Investigation", "Root cause", "CAPA", "Verification", "Closed"];

function stage(c: Complaint): number {
  if (c.complaint_status === "Closed") return 7;
  if (c.capa_id) return c.capa_effectiveness_status?.startsWith("Pending") ? 5 : 4;
  if (c.root_cause_status && ["Confirmed", "Probable"].includes(c.root_cause_status)) return 4;
  if (c.investigation_status && c.investigation_status !== "Not started") return 2;
  return c.complaint_status === "Open" ? 1 : 2;
}

function EditDialog({ c, open, onOpenChange }: { c: Complaint; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ complaint_status: c.complaint_status, complaint_severity: c.complaint_severity ?? "", owner: c.owner ?? "", complaint_closed_date: c.complaint_closed_date ?? "", change_reason: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.patch(`/api/complaints/${c.complaint_id}`, { ...form, complaint_severity: form.complaint_severity || null, owner: form.owner || null, complaint_closed_date: form.complaint_closed_date || null }),
    onSuccess: () => { toast("ok", "Complaint updated - change recorded in the audit log"); qc.invalidateQueries(); onOpenChange(false); },
    onError: (e) => { if (e instanceof ApiError) setErrs(Object.fromEntries([...e.fieldErrors.map((f) => [f.field, f.message]), ["_", e.fieldErrors.length ? "" : e.message]])); },
  });
  const upd = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Edit ${c.complaint_id}`} description="Only operational fields can be edited. Recorded source values and ML-training labels are preserved." wide
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={() => {
        if (form.change_reason.trim().length < 3) return setErrs({ change_reason: "Give a reason for the change" });
        if (form.complaint_status === "Closed" && !form.complaint_closed_date) return setErrs({ complaint_closed_date: "A closed complaint needs a closed date" });
        m.mutate();
      }}>Save changes</Button></>}>
      {errs._ && <Banner tone="bad" className="mb-3">{errs._}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="e-status"><Select id="e-status" value={form.complaint_status} onChange={upd("complaint_status")} options={["Open", "Under investigation", "Awaiting customer information", "Closed"]} /></Field>
        <Field label="Severity" htmlFor="e-sev"><Select id="e-sev" value={form.complaint_severity} onChange={upd("complaint_severity")} placeholder="Not set" options={["Routine", "Major", "Critical"]} /></Field>
        <Field label="Owner" optional htmlFor="e-owner"><Input id="e-owner" value={form.owner} onChange={upd("owner")} /></Field>
        <Field label="Closed date" htmlFor="e-closed" error={errs.complaint_closed_date}><Input id="e-closed" type="date" value={form.complaint_closed_date} onChange={upd("complaint_closed_date")} min={c.complaint_received_date} /></Field>
      </div>
      <div className="mt-4"><Field label="Reason for change" required htmlFor="e-reason" error={errs.change_reason}><Textarea id="e-reason" rows={2} value={form.change_reason} onChange={upd("change_reason")} /></Field></div>
    </Modal>
  );
}

export default function ComplaintDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<"notes" | "activity" | "history" | "source">("notes");
  const [confirmCause, setConfirmCause] = useState(false);
  const q = useQuery({ queryKey: ["complaint", id], queryFn: () => api.get<Detail>(`/api/complaints/${encodeURIComponent(id)}`) });
  const pk = q.data?.complaint.id;
  const runs = useQuery({ queryKey: ["runs", pk], queryFn: () => api.get<{ runs: AnalysisRun[] }>(`/api/ml/complaints/${pk}/runs`), enabled: !!pk });
  const analyze = useMutation({
    mutationFn: () => api.post<AnalysisRun>(`/api/ml/analyze/complaint/${encodeURIComponent(id)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runs", pk] }); toast("ok", "Analysis complete - results stored"); },
    onError: (e) => toast("bad", e instanceof Error ? e.message : "Analysis failed"),
  });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-16 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { complaint: c, extra, historical_root_cause_hypotheses: hist, submitter, attachments, root_cause_confirmation: confirmation, analysis_status } = q.data!;
  // newest output per model across runs (e.g. a root-cause run added after category verification)
  const latest = runs.data?.runs.length ? { ...runs.data.runs[0], predictions: runs.data.runs.reduceRight<Record<string, AnalysisRun["predictions"][string]>>((acc, r) => ({ ...acc, ...r.predictions }), {}) } : undefined;
  return (
    <>
      <PageHeader title={c.complaint_id} description={c.complaint_summary ?? c.complaint_description.slice(0, 80)}
        meta={<><SeverityPill value={c.complaint_severity} /><StatusPill value={c.complaint_status} />{c.is_synthetic && <ProvenanceBadge kind="demo" />}
          {c.food_safety_related_flag && <Pill tone="bad" icon={<ShieldAlert className="size-3" />}>Food-safety related (recorded)</Pill>}</>}
        actions={<>
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>
          <Button icon={<BrainCircuit className="size-4" />} loading={analyze.isPending} onClick={() => analyze.mutate()}>Run AI analysis</Button>
        </>} />
      <Card className="mb-4" bodyClass="py-3"><Stepper label="Investigation stage (derived from recorded fields)" steps={STEPS} current={stage(c)} /></Card>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <Card title="Complaint description" actions={<ProvenanceBadge kind="recorded" />}>
            <p className="text-ink-2 whitespace-pre-wrap leading-6">{c.complaint_description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-[13px]">
              <div><div className="text-muted text-[12px]">Recorded category</div>{c.complaint_category ?? <span className="text-faint">Not recorded</span>} {c.category_source === "human_verified" && <ProvenanceBadge kind="human" />}</div>
              <div><div className="text-muted text-[12px]">Recorded defect subcategory</div>{c.defect_subcategory ?? <span className="text-faint">Not recorded</span>}</div>
            </div>
          </Card>

          {attachments.length > 0 && (
            <Card title={`Photos (${attachments.length})`} subtitle="Supporting evidence from the complainant - not analysed by AI" actions={<ProvenanceBadge kind="recorded" label="Evidence" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {attachments.map((a) => {
                  const src = `/api/complaints/${encodeURIComponent(c.complaint_id)}/attachments/${a.id}`;
                  return (
                    <figure key={a.id} className="rounded-[var(--radius-card)] border border-line overflow-hidden bg-surface-2">
                      <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Complaint photo ${a.filename}`} className="h-36 w-full object-cover" loading="lazy" /></a>
                      <figcaption className="p-2 text-[11px] text-muted"><div className="truncate" title={a.filename}>{a.filename}</div><div>{a.width}x{a.height} · {(a.size_bytes / 1024).toFixed(0)} KB</div><div className="font-mono truncate" title={`SHA-256 ${a.sha256}`}>sha256 {a.sha256.slice(0, 12)}</div></figcaption>
                    </figure>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Root cause" subtitle="Recorded, predicted and human-confirmed causes are kept separate"
            actions={<Button size="sm" variant="secondary" onClick={() => setConfirmCause(true)}>{c.root_cause_status === "Confirmed" ? "Change confirmed cause" : "Record confirmed cause"}</Button>}>
            <div className="space-y-3 text-[13px]">
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-card)] border border-line p-3">
                <div><div className="text-[12px] text-muted">Recorded root cause</div><div className="font-medium">{c.root_cause_category ?? <span className="text-faint font-normal">None recorded</span>}</div>
                  {c.root_cause_evidence && <div className="text-[12px] text-muted mt-0.5">Evidence: {c.root_cause_evidence}</div>}</div>
                <div className="flex flex-col items-end gap-1">{confirmation ? <ProvenanceBadge kind="human" label={`Confirmed by ${confirmation.by ?? "staff"} · ${fmtDate(confirmation.at.slice(0, 10))}`} /> : <ProvenanceBadge kind="recorded" />}{c.root_cause_status && <Pill tone={c.root_cause_status === "Confirmed" ? "ok" : c.root_cause_status === "Probable" ? "info" : "neu"}>Status: {c.root_cause_status}</Pill>}</div>
              </div>
              {hist && (
                <div className="rounded-[var(--radius-card)] border border-dashed p-3" style={{ borderColor: "var(--pv-hist-bd)" }}>
                  <div className="flex flex-wrap justify-between gap-2 mb-1.5"><span className="text-[12px] text-muted">Pre-computed hypotheses from the supplied ML package (root-cause model v1)</span><ProvenanceBadge kind="historical" /></div>
                  <ol className="space-y-1">{hist.map((h, i) => <li key={h.cause} className="flex justify-between"><span>{i + 1}. {h.cause}</span><span className="num text-muted">{h.probability.toFixed(2)}</span></li>)}</ol>
                  <p className="text-[12px] text-muted mt-1.5">Possible explanations only - not a confirmed root cause.</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="AI analysis" subtitle={latest ? `Latest run ${fmtDateTime(latest.created_at)} by ${latest.created_by ?? "—"}` : "No analysis has been run for this complaint yet"}
            actions={<div className="flex items-center gap-2">{analysis_status && analysis_status !== "completed" && <Pill tone={analysis_status === "failed" ? "bad" : "warn"}>Analysis {analysis_status}</Pill>}{latest && latest.predictions["nlp-category"] && <ReviewStatus p={latest.predictions["nlp-category"]} />}</div>}>
            {runs.isLoading ? <Skeleton className="h-40 w-full" /> : latest ? <AnalysisResult run={latest} showInput={false} /> : (
              <div className="text-center py-6">
                <p className="text-muted text-[13px] max-w-md mx-auto">Runs the complaint category and subcategory classifiers, the food-safety rule, similar-case retrieval and root-cause hypotheses. Results are stored with the model versions used.</p>
                <Button className="mt-3" icon={<BrainCircuit className="size-4" />} loading={analyze.isPending} onClick={() => analyze.mutate()}>Run AI analysis</Button>
              </div>
            )}
          </Card>

          <Card bodyClass="p-0">
            <div role="tablist" className="flex gap-1 px-4 border-b border-line overflow-x-auto">
              {(["notes", "activity", "history", "source"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-11 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap shrink-0", tab === t ? "border-primary text-ink" : "border-transparent text-muted")}>
                  {t === "notes" ? "Investigation notes" : t === "activity" ? "Activity" : t === "history" ? `Prediction history (${runs.data?.runs.length ?? 0})` : "Unmapped source fields"}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "notes" ? <NotesPanel id={c.complaint_id} /> : tab === "activity" ? <ActivityPanel id={c.complaint_id} /> : tab === "history" ? (
                runs.data?.runs.length ? (
                  <ul className="divide-y divide-line text-[13px]">
                    {runs.data.runs.map((r) => (
                      <li key={r.run_id} className="py-2.5 flex flex-wrap justify-between gap-2">
                        <div><div>{fmtDateTime(r.created_at)} · {r.created_by}</div>
                          <div className="text-[12px] text-muted">{Object.values(r.predictions).map((p) => `${p.model.key} v${p.model.version}: ${p.status === "completed" ? p.top_label : p.status.replace("_", " ")}`).join(" · ")}</div></div>
                        <ReviewStatus p={r.predictions["nlp-category"]} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-muted">Every analysis run is kept here - results are never overwritten when models change.</p>
              ) : (
                Object.keys(extra).length ? <KeyValue items={Object.entries(extra).map(([k, v]) => [k, <span className="text-[13px] break-all">{v}</span>])} /> : <p className="text-[13px] text-muted">No unmapped fields.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-4">
          {submitter && (
            <Card title="Complainant" subtitle="Submitted on the public form - personal data, staff only" actions={<ProvenanceBadge kind="recorded" />}>
              <KeyValue cols={1} items={[["Name", submitter.name], ["Organisation", submitter.organisation], ["Email", submitter.email ? <a href={`mailto:${submitter.email}`} className="text-link hover:underline break-all">{submitter.email}</a> : null],
                ["Additional information", submitter.additional_info]]} />
            </Card>
          )}
          <Card title="Key facts" actions={<ProvenanceBadge kind="recorded" />}>
            <KeyValue cols={1} items={[
              ["Received", fmtDate(c.complaint_received_date)], ["Event date", fmtDate(c.event_date)], ["Channel", c.complaint_channel],
              ["Product", <>{c.product_name}{c.product_id && <Mono className="block text-[12px] text-muted">{c.product_id}</Mono>}</>],
              ["Food family", c.food_family], ["Batch", c.batch_id ? <Link to={`/app/complaints?batch=${c.batch_id}`} className="font-mono text-[13px] text-link hover:underline">{c.batch_id}</Link> : "Not supplied by customer"],
              ["Dispatch date", fmtDate(c.dispatch_date)], ["Customer", c.customer_name], ["Segment / region", [c.customer_segment, c.customer_region].filter(Boolean).join(" · ") || null],
              ["Units affected", c.reported_units_affected], ["HACCP step", c.haccp_process_step], ["Owner", c.owner], ["Closed", fmtDate(c.complaint_closed_date)],
            ]} />
          </Card>
          <Card title="CAPA">
            <div className="space-y-3 text-[13px]">
              {c.capa_id ? (
                <div className="rounded-[var(--radius-card)] border border-line p-3">
                  <Link to={`/app/capa/${c.capa_id}`} className="font-mono text-link hover:underline">{c.capa_id}</Link>
                  <div className="text-[12px] text-muted mt-1">Recorded effectiveness</div><div>{c.capa_effectiveness_status}</div>
                </div>
              ) : <p className="text-muted">No CAPA raised from this complaint.</p>}
              {c.recurrence_after_prior_capa && c.prior_capa_id && (
                <Banner tone="warn" title="Recurrence after an earlier CAPA">This complaint is recorded as a recurrence of <Link to={`/app/capa/${c.prior_capa_id}`} className="font-mono text-link hover:underline">{c.prior_capa_id}</Link>{c.capa_follow_up_days !== null && <> ({c.capa_follow_up_days} days after it)</>}.</Banner>
              )}
            </div>
          </Card>
          <Card title="Provenance">
            <KeyValue cols={1} items={[["Source", c.source === "manual" ? "Manual entry in CauseLine" : "File import"], ["Import", c.upload_id ? <Link to={`/app/complaints?upload_id=${c.upload_id}`} className="text-link hover:underline">Import #{c.upload_id}</Link> : null],
              ["Source row", c.source_row_number], ["Data origin", c.data_origin], ["Created", fmtDateTime(c.created_at)], ["Last updated", fmtDateTime(c.updated_at)]]} />
          </Card>
        </div>
      </div>
      {edit && <EditDialog c={c} open={edit} onOpenChange={setEdit} />}
      {confirmCause && <ConfirmCauseDialog c={c} open={confirmCause} onOpenChange={setConfirmCause} />}
    </>
  );
}

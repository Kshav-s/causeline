import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, Clock, Copy, KeyRound, RotateCw, ShieldAlert } from "lucide-react";
import { ApiError, keyApi } from "../../services/api";
import type { AnalysisRun } from "../../types/api";
import { Banner, Button, InsufficientData, KeyValue, Mono, Pill, SeverityPill, Skeleton, StatusPill } from "../../components/ui/primitives";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { AnalysisResult } from "../../components/domain/AnalysisResult";
import { keyFor, saveComplaint } from "../../utils/localComplaints";
import { fmtDate, fmtDateTime } from "../../utils/format";

type View = {
  complaint: { complaint_id: string; submitted_at: string; complaint_date: string | null; product_name: string; batch_id: string | null; description: string; severity: string | null;
    additional_info: string | null; submitter_name: string | null; organisation: string | null; status: string; investigation_status: string | null; analysis_status: string | null;
    analysis_attempts: number | null; last_analysis_at: string | null; verified_category: string | null; confirmed_root_cause: string | null };
  attachments: { id: number; filename: string; content_type: string; size_bytes: number; width: number | null; height: number | null }[];
  analysis: (AnalysisRun & { created_at: string }) | null;
  timeline: { at: string; kind: "recorded" | "ai" | "human"; title: string; detail: string | null }[];
};

const WHO: Record<string, { label: string; kind: "recorded" | "nlp" | "human"; dot: string }> = {
  recorded: { label: "Recorded", kind: "recorded", dot: "var(--pv-recorded-fg)" },
  ai: { label: "AI suggestion", kind: "nlp", dot: "var(--pv-nlp-fg)" },
  human: { label: "Quality team", kind: "human", dot: "var(--pv-human-fg)" },
};

function Timeline({ items }: { items: View["timeline"] }) {
  return (
    <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-line">
      {items.map((e, i) => {
        const w = WHO[e.kind] ?? WHO.recorded;
        return (
          <li key={i} className="relative pl-6">
            <span className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-surface" style={{ background: w.dot }} aria-hidden />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium text-ink">{e.title}</span>
              <ProvenanceBadge kind={w.kind} label={w.label} />
            </div>
            <div className="text-[12px] text-muted"><time dateTime={e.at}>{fmtDateTime(e.at)}</time>{e.detail && <> · {e.detail}</>}</div>
          </li>
        );
      })}
    </ol>
  );
}

const ANALYSIS: Record<string, { tone: "ok" | "warn" | "bad" | "info"; label: string }> = {
  completed: { tone: "ok", label: "AI analysis complete" }, partial: { tone: "warn", label: "AI analysis partly complete" },
  failed: { tone: "bad", label: "AI analysis unavailable" }, pending: { tone: "info", label: "AI analysis pending" },
};

function Photo({ cid, a, k }: { cid: string; a: View["attachments"][number]; k: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    keyApi.blobUrl(`/api/public/complaints/${cid}/attachments/${a.id}`, k).then((x) => { u = x; setUrl(x); }).catch(() => setErr(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [cid, a.id, k]);
  return (
    <figure className="rounded-[var(--radius-card)] border border-line overflow-hidden bg-surface-2">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Photo: ${a.filename}`} className="h-40 w-full object-cover" /></a>
        : err ? <div className="h-40 grid place-items-center text-[12px] text-muted">Image unavailable</div> : <Skeleton className="h-40 w-full rounded-none" />}
      <figcaption className="p-2 text-[11px] text-muted truncate" title={a.filename}>{a.filename} · {(a.size_bytes / 1024).toFixed(0)} KB</figcaption>
    </figure>
  );
}

export default function ComplaintStatus() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const [sp] = useSearchParams();
  const isNew = sp.get("new") === "1";
  const key = useMemo(() => new URLSearchParams(hash.replace(/^#/, "")).get("key") ?? keyFor(id) ?? "", [hash, id]);
  const [copied, setCopied] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["public-complaint", id, key], enabled: !!key, retry: false, queryFn: () => keyApi.get<View>(`/api/public/complaints/${encodeURIComponent(id)}`, key) });
  useEffect(() => {
    if (!q.data || !key) return;
    if (!keyFor(id)) saveComplaint({ id, key, product: q.data.complaint.product_name, at: q.data.complaint.submitted_at });
    // key is now on this device - drop it from the address bar so it is not left in history or screenshots
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, [q.data, key, id]);
  const retry = useMutation({ mutationFn: () => keyApi.post<View>(`/api/public/complaints/${encodeURIComponent(id)}/analyze`, key), onSuccess: (v) => qc.setQueryData(["public-complaint", id, key], v) });
  const copy = (label: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 2000); };

  const shell = (children: React.ReactNode) => (
    <div className="bg-canvas">
      <div className="bg-graphite-950 grid-texture text-white pt-28 pb-10">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-petrol-400">Your complaint</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] leading-10 max-md:text-[24px] font-semibold font-mono tracking-tight">{id}</h1>
            <button onClick={() => copy("id", id)} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded border border-white/20 text-[12px] hover:bg-white/10">{copied === "id" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}Copy reference</button>
          </div>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-5 py-10">{children}</div>
    </div>
  );

  if (!key) return shell(<Banner tone="warn" title="Access key needed">This page needs the private access key you received when you submitted the complaint. <Link to={`/track?id=${encodeURIComponent(id)}`} className="text-link underline">Enter it here</Link>.</Banner>);
  if (q.isLoading) return shell(<div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>);
  if (q.error) return shell(<Banner tone="bad" title={q.error instanceof ApiError && q.error.status === 404 ? "Complaint not found" : "Could not load your complaint"}>
    {q.error instanceof ApiError && q.error.status === 404 ? "The reference or access key is not correct. Check both and try again." : (q.error as Error).message} <Link to="/track" className="text-link underline">Track a complaint</Link></Banner>);
  const { complaint: c, attachments, analysis } = q.data!;
  const st = ANALYSIS[c.analysis_status ?? "pending"] ?? ANALYSIS.pending;
  const canRetry = c.analysis_status !== "completed";

  return shell(
    <div className="space-y-5">
      {isNew && (
        <div className="rounded-[var(--radius-card)] border-2 border-petrol-500 bg-primary-tint p-5" role="status">
          <div className="flex items-start gap-3">
            <KeyRound className="size-5 text-link mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink">Complaint received - save these details</h2>
              <p className="text-[13px] text-ink-2 mt-1">Your reference is <b className="font-mono">{c.complaint_id}</b>. Your private access key is shown only now; you need both to view this complaint later. It is also remembered on this device.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="font-mono text-[13px] bg-surface border border-line rounded px-2 py-1.5 break-all">{key}</code>
                <Button size="sm" variant="secondary" icon={copied === "key" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => copy("key", key)}>{copied === "key" ? "Copied" : "Copy key"}</Button>
                <Button size="sm" variant="secondary" icon={copied === "link" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => copy("link", `${window.location.origin}/complaint/${c.complaint_id}#key=${encodeURIComponent(key)}`)}>{copied === "link" ? "Copied" : "Copy private link"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill value={c.status} /><Pill tone={st.tone}>{st.label}</Pill><SeverityPill value={c.severity} />
        <span className="text-[12px] text-muted ml-1">Submitted {fmtDateTime(c.submitted_at)}{c.last_analysis_at && <> · analysed {fmtDateTime(c.last_analysis_at)}</>}</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-5 space-y-5 min-w-0">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-label="Your complaint">
            <div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold">What you reported</h2><ProvenanceBadge kind="recorded" label="Recorded information" /></div>
            <p className="text-ink-2 whitespace-pre-wrap leading-6">{c.description}</p>
            <div className="mt-4"><KeyValue items={[["Product", c.product_name], ["Batch / lot", c.batch_id], ["Date of problem", fmtDate(c.complaint_date)], ["Your severity", c.severity ?? "Not given"],
              ["Submitted by", [c.submitter_name, c.organisation].filter(Boolean).join(", ")], ["Additional information", c.additional_info]]} /></div>
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-label="Photos">
            <div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold">Photos ({attachments.length})</h2><ProvenanceBadge kind="recorded" label="Evidence" /></div>
            {attachments.length ? <div className="grid grid-cols-2 gap-3">{attachments.map((a) => <Photo key={a.id} cid={c.complaint_id} a={a} k={key} />)}</div>
              : <p className="text-[13px] text-muted">No photos were attached.</p>}
            <p className="text-[12px] text-muted mt-3">Photos are evidence for the quality team. They are not analysed by AI.</p>
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-label="Investigation">
            <div className="flex items-center justify-between gap-2 mb-3"><h2 className="font-semibold">Investigation findings</h2><ProvenanceBadge kind="human" label="Human verified" /></div>
            {c.verified_category || c.confirmed_root_cause ? (
              <KeyValue cols={1} items={[["Confirmed category", c.verified_category ?? "Not yet confirmed"], ["Confirmed root cause", c.confirmed_root_cause ?? "Not yet confirmed"]]} />
            ) : (
              <p className="text-[13px] text-muted flex gap-2"><Clock className="size-4 shrink-0 mt-0.5" />Not reviewed yet. When an investigator confirms the category or root cause it appears here, separate from the AI suggestions.</p>
            )}
            {c.investigation_status && <p className="text-[12px] text-muted mt-2">Investigation status: {c.investigation_status}</p>}
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-label="Investigation timeline">
            <h2 className="font-semibold mb-3">Timeline</h2>
            {q.data!.timeline?.length ? <Timeline items={q.data!.timeline} /> : <p className="text-[13px] text-muted">No events recorded yet.</p>}
            <p className="text-[12px] text-muted mt-4 border-t border-line pt-3">Shows what happened to your complaint and who it came from. Internal investigation notes and staff names are not shown.</p>
          </section>
        </div>
        <div className="xl:col-span-7 min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">AI analysis</h2>
            {analysis && <span className="text-[12px] text-muted">Run {fmtDateTime(analysis.created_at)}</span>}
          </div>
          {canRetry && (
            <Banner tone={c.analysis_status === "failed" ? "bad" : "warn"} title={c.analysis_status === "failed" ? "The AI analysis could not run" : c.analysis_status === "partial" ? "Some AI checks could not run" : "AI analysis has not run yet"}
              action={<Button size="sm" variant="secondary" loading={retry.isPending} icon={<RotateCw className="size-3.5" />} onClick={() => retry.mutate()}>Retry analysis</Button>}>
              Your complaint is saved ({c.complaint_id}) - you do not need to submit it again. {retry.error ? (retry.error as Error).message : ""}
            </Banner>
          )}
          {analysis ? <AnalysisResult run={analysis} showInput={false} readOnly recorded={`Your description, product details and ${attachments.length} photo${attachments.length === 1 ? "" : "s"}`} verified={{ category: c.verified_category, rootCause: c.confirmed_root_cause }} /> : <InsufficientData title="No analysis results yet">The models have not produced a result for this complaint. Use Retry analysis above.</InsufficientData>}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4 text-[12px] text-muted flex gap-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <p><b className="text-ink-2">Model disclaimer.</b> The AI models were trained on synthetic demonstration data. Their outputs are suggestions with stated uncertainty, not findings. Categories and root causes are confirmed only by the CauseLine quality team <BadgeCheck className="inline size-3.5" />.</p>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-muted">Your complaint is listed (without your personal details) in the <Link to={`/register?q=${c.complaint_id}`} className="text-link hover:underline">complaint register</Link>. Reference <Mono>{c.complaint_id}</Mono>.</p>
    </div>,
  );
}

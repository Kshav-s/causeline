import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Cpu } from "lucide-react";
import { api } from "../../services/api";
import { Card, Mono, PageHeader, Pill } from "../../components/ui/primitives";
import { cx, fmtDateTime, fmtInt } from "../../utils/format";

type M = { model_key: string; version: string; name: string; purpose: string; kind: string; status: string; status_reason: string | null; artifact_paths: string[]; artifact_sha256: Record<string, string>;
  input_schema: Record<string, unknown>; output_schema: Record<string, unknown>; preprocessing_version: string; metrics: Record<string, unknown>; limitations: string[]; confidence_supported: boolean;
  low_confidence_threshold: number | null; last_validated_at: string | null };
type V = { model_key: string; version: string; status: string; predictions: number; created_at: string };
const TONE: Record<string, "ok" | "warn" | "bad" | "info"> = { ready: "ok", degraded: "warn", blocked: "bad", loading: "info" };

function Json({ v }: { v: unknown }) {
  return <pre className="text-[11px] bg-surface-2 border border-line rounded p-2 overflow-auto max-h-56 whitespace-pre-wrap break-all">{JSON.stringify(v, null, 2)}</pre>;
}

function ModelCard({ m, versions }: { m: M; versions: V[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Cpu className="size-4 text-muted" /><h3 className="font-semibold">{m.name}</h3><Mono className="text-[12px] text-muted">{m.model_key} v{m.version}</Mono></div>
          <p className="text-[13px] text-ink-2 mt-1">{m.purpose}</p>
        </div>
        <div className="flex items-center gap-2"><Pill tone="neu">{m.kind}</Pill><Pill tone={TONE[m.status] ?? "neu"}>{m.status}</Pill></div>
      </div>
      {m.status_reason && <p className="mt-2 text-[12px] text-muted">{m.status_reason}</p>}
      <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-[12px]">
        <div><dt className="text-muted">Preprocessing</dt><dd className="font-mono break-all">{m.preprocessing_version}</dd></div>
        <div><dt className="text-muted">Confidence</dt><dd>{m.confidence_supported ? `Probabilities (uncalibrated) · low below ${m.low_confidence_threshold}` : "Not provided"}</dd></div>
        <div><dt className="text-muted">Last validated</dt><dd>{fmtDateTime(m.last_validated_at)}</dd></div>
      </dl>
      <button className="mt-3 flex items-center gap-1 text-[13px] text-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} />Schemas, metrics, artifacts and limitations</button>
      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div><div className="text-[12px] font-medium mb-1">Input schema</div><Json v={m.input_schema} /></div>
          <div><div className="text-[12px] font-medium mb-1">Output schema</div><Json v={m.output_schema} /></div>
          <div><div className="text-[12px] font-medium mb-1">Reported metrics</div><Json v={m.metrics} /></div>
          <div><div className="text-[12px] font-medium mb-1">Limitations</div><ul className="list-disc pl-5 text-[12px] space-y-1">{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul></div>
          <div className="lg:col-span-2"><div className="text-[12px] font-medium mb-1">Artifacts (SHA-256)</div>
            <ul className="text-[11px] font-mono space-y-1">{m.artifact_paths.length ? m.artifact_paths.map((p) => <li key={p} className="break-all">{p}<br /><span className="text-muted">{m.artifact_sha256[p] ?? "not hashed"}</span></li>) : <li className="text-muted">Rule-based - no artifact</li>}</ul></div>
          <div className="lg:col-span-2"><div className="text-[12px] font-medium mb-1">Version history</div>
            <ul className="text-[12px]">{versions.map((v) => <li key={v.version}>v{v.version} · {v.status} · {fmtInt(v.predictions)} stored predictions · registered {fmtDateTime(v.created_at)}</li>)}</ul></div>
        </div>
      )}
    </Card>
  );
}

export default function Models() {
  const q = useQuery({ queryKey: ["models"], queryFn: () => api.get<{ models: M[]; versions: V[] }>("/api/ml/models") });
  return (
    <>
      <PageHeader title="Model registry" description="Every model and rule CauseLine runs, with its version, artifact hashes, schemas, readiness and limitations. Predictions reference the exact version used." />
      <div className="space-y-4">{q.data?.models.map((m) => <ModelCard key={m.model_key} m={m} versions={q.data!.versions.filter((v) => v.model_key === m.model_key)} />)}</div>
    </>
  );
}

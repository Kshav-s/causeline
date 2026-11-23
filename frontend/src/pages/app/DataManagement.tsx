import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { api, ApiError, downloadUrl } from "../../services/api";
import { useUrlState } from "../../hooks/useUrlState";
import { useCapabilities } from "../../hooks/auth";
import { Banner, Button, Card, Mono, PageHeader, Pill } from "../../components/ui/primitives";
import { CountTabs, DataTable } from "../../components/ui/DataTable";
import { Select } from "../../components/ui/forms";
import { ConfirmDialog, useToast } from "../../components/ui/overlays";
import { Stepper } from "../../components/ui/Stepper";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { cx, fmtDateTime, fmtInt } from "../../utils/format";

type UploadRec = { id: number; reference: string; original_filename: string; sha256: string; size_bytes: number; file_type: string; sheet_name: string | null; status: string; rows_total: number;
  rows_valid: number; rows_inserted: number; rows_duplicate: number; rows_failed: number; is_synthetic_source: boolean; created_at: string; created_by?: string };
type Sheet = { name: string | null; rows: number; columns: number };
type Columns = { columns: string[]; rows: number; suggested_mapping: Record<string, { target: string | null; score: number }>; sample: Record<string, string>[]; fields: { field: string; label: string; type: string; required: boolean }[] };
type Summary = { rows_total: number; rows_valid: number; rows_with_errors: number; duplicates_in_file: number; duplicates_existing: number; errors: { row: number; field: string; message: string }[]; errors_truncated: boolean;
  warnings: { row: number; field: string; message: string }[]; duplicate_examples: { row: number; complaint_id: string; message: string }[] };
type Preview = { row: number; values: Record<string, string>; errors: { field: string; message: string }[] };

const STEPS = ["File", "Sheet", "Map columns", "Validate", "Import"];
const MAX_MB = 25;

function Wizard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [drag, setDrag] = useState(false);
  const [upload, setUpload] = useState<{ upload: UploadRec; sheets: Sheet[]; already_imported: { reference: string; at: string } | null } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<{ summary: Summary; preview: Preview[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<UploadRec | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (step > 0 && step < 4 && !done) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [step, done]);

  const up = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append("file", f); return api.post<{ upload: UploadRec; sheets: Sheet[]; already_imported: { reference: string; at: string } | null }>("/api/uploads", fd); },
    onSuccess: (r) => { setUpload(r); setSheet(r.sheets[0]?.name ?? null); setStep(r.sheets.length > 1 ? 1 : 2); },
    onError: (e) => setFileErr(e instanceof ApiError ? e.message : "Upload failed"),
  });
  const cols = useQuery({ queryKey: ["upload-cols", upload?.upload.id, sheet], enabled: !!upload && step >= 2,
    queryFn: () => api.get<Columns>(`/api/uploads/${upload!.upload.id}/columns`, { sheet_name: sheet }) });
  useEffect(() => { if (cols.data) setMapping(Object.fromEntries(Object.entries(cols.data.suggested_mapping).map(([c, v]) => [c, v.target]))); }, [cols.data]);
  const validate = useMutation({ mutationFn: () => api.post<{ summary: Summary; preview: Preview[] }>(`/api/uploads/${upload!.upload.id}/validate`, { sheet_name: sheet, mapping }),
    onSuccess: (r) => { setResult(r); setStep(3); }, onError: (e) => toast("bad", e instanceof Error ? e.message : "Validation failed") });
  const commit = useMutation({ mutationFn: () => api.post<{ upload: UploadRec }>(`/api/uploads/${upload!.upload.id}/commit`),
    onSuccess: (r) => { setDone(r.upload); setStep(4); setConfirm(false); qc.invalidateQueries(); toast("ok", `${r.upload.rows_inserted} complaints imported`); },
    onError: (e) => { setConfirm(false); toast("bad", e instanceof Error ? e.message : "Import failed"); } });

  const pick = (f: File | undefined) => {
    setFileErr(null);
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["csv", "xlsx"].includes(ext ?? "")) return setFileErr("Only .csv and .xlsx files are accepted.");
    if (f.size > MAX_MB * 1024 * 1024) return setFileErr(`File is larger than ${MAX_MB} MB.`);
    if (f.size === 0) return setFileErr("File is empty.");
    up.mutate(f);
  };
  const reset = () => { if (upload && !done) api.post(`/api/uploads/${upload.upload.id}/cancel`).catch(() => undefined); setStep(0); setUpload(null); setResult(null); setDone(null); setMapping({}); };
  const targets = Object.values(mapping).filter(Boolean) as string[];
  const dupTargets = targets.filter((t, i) => targets.indexOf(t) !== i);
  const missingReq = cols.data?.fields.filter((f) => f.required && !targets.includes(f.field)) ?? [];

  return (
    <Card bodyClass="p-0">
      <div className="p-4 border-b border-line"><Stepper label="Import steps" steps={STEPS} current={step} /></div>
      <div className="p-4">
        {step === 0 && (
          <div>
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className={cx("rounded-[var(--radius-card)] border-2 border-dashed p-10 text-center transition-colors", drag ? "border-petrol-500 bg-primary-tint" : "border-line-strong")}>
              <UploadCloud className="size-8 mx-auto text-muted" />
              <p className="mt-3 font-medium">Drag a complaint file here</p>
              <p className="text-[13px] text-muted mt-1">.csv or .xlsx · up to {MAX_MB} MB · the original file is stored unchanged</p>
              <Button className="mt-4" variant="secondary" loading={up.isPending} onClick={() => input.current?.click()}>Choose file</Button>
              <input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Choose complaint file" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            {fileErr && <Banner tone="bad" className="mt-3">{fileErr}</Banner>}
          </div>
        )}
        {upload && step >= 1 && step < 4 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 text-[13px]">
            <FileSpreadsheet className="size-4 text-muted" /><b>{upload.upload.original_filename}</b><span className="text-muted">{fmtInt(Math.round(upload.upload.size_bytes / 1024))} KB</span>
            <Mono className="text-[11px] text-muted" >sha256 {upload.upload.sha256.slice(0, 12)}…</Mono>
            <button className="ml-auto text-link hover:underline" onClick={reset}>Start over</button>
          </div>
        )}
        {upload?.already_imported && step < 4 && <Banner tone="warn" className="mb-4" title="This exact file was imported before">Import {upload.already_imported.reference} on {fmtDateTime(upload.already_imported.at)}. Rows already in the database will be reported as duplicates and skipped.</Banner>}
        {step === 1 && upload && (
          <div className="max-w-md space-y-3">
            <label className="block text-[13px] font-medium" htmlFor="sheet">Worksheet</label>
            <Select id="sheet" value={sheet ?? ""} onChange={(e) => setSheet(e.target.value)} options={upload.sheets.map((s) => ({ value: s.name ?? "", label: `${s.name} - ${fmtInt(s.rows)} rows, ${s.columns} columns` }))} />
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        )}
        {step === 2 && (
          cols.isLoading ? <p className="text-muted">Reading columns…</p> : cols.error ? <Banner tone="bad">{(cols.error as Error).message}</Banner> : cols.data && (
            <div>
              <p className="text-[13px] text-muted mb-3">{fmtInt(cols.data.rows)} data rows. Map each source column to a CauseLine field, or leave it unmapped - unmapped values are preserved with the record.</p>
              {missingReq.length > 0 && <Banner tone="warn" className="mb-3">Required fields not mapped: {missingReq.map((f) => f.label).join(", ")}.</Banner>}
              {dupTargets.length > 0 && <Banner tone="bad" className="mb-3">Two columns are mapped to the same field: {[...new Set(dupTargets)].join(", ")}.</Banner>}
              <div className="divide-y divide-line border border-line rounded-[var(--radius-card)]">
                {cols.data.columns.map((c) => {
                  const s = cols.data!.suggested_mapping[c];
                  return (
                    <div key={c} className="grid gap-2 p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                      <div className="min-w-0"><div className="font-mono text-[12px] truncate">{c}</div><div className="text-[12px] text-muted truncate">e.g. {cols.data!.sample[0]?.[c] || "(empty)"}</div></div>
                      <Select aria-label={`Target field for ${c}`} value={mapping[c] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [c]: e.target.value || null }))} placeholder="Keep unmapped"
                        options={cols.data!.fields.map((f) => ({ value: f.field, label: `${f.label}${f.required ? " *" : ""}` }))} />
                      <span className="text-[11px] text-muted md:w-28 md:text-right">{s.target ? (s.score === 1 ? <Pill tone="ok">Exact match</Pill> : <Pill tone="info">Suggested {Math.round(s.score * 100)}%</Pill>) : "No suggestion"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2"><Button disabled={missingReq.length > 0 || dupTargets.length > 0} loading={validate.isPending} onClick={() => validate.mutate()}>Validate {fmtInt(cols.data.rows)} rows</Button></div>
            </div>
          )
        )}
        {step === 3 && result && (
          <div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-4">
              {[["Rows", result.summary.rows_total, "neu"], ["Valid - will import", result.summary.rows_valid, "ok"], ["With errors - skipped", result.summary.rows_with_errors, result.summary.rows_with_errors ? "bad" : "neu"],
                ["Duplicate in file", result.summary.duplicates_in_file, result.summary.duplicates_in_file ? "warn" : "neu"], ["Already in database", result.summary.duplicates_existing, result.summary.duplicates_existing ? "warn" : "neu"]].map(([l, v, t]) => (
                <div key={l as string} className="rounded-[var(--radius-card)] border border-line p-3"><div className="text-[12px] text-muted">{l as string}</div><div className="num text-xl font-semibold" style={{ color: t === "neu" ? undefined : `var(--${t}-fg)` }}>{fmtInt(v as number)}</div></div>
              ))}
            </div>
            {result.summary.errors.length > 0 && (
              <Banner tone="bad" className="mb-3" title={`${fmtInt(result.summary.errors.length)}${result.summary.errors_truncated ? "+" : ""} validation errors`}
                action={<a href={downloadUrl(`/api/uploads/${upload!.upload.id}/errors.csv`)} className="text-[12px] text-link hover:underline flex items-center gap-1 shrink-0"><Download className="size-3.5" />Errors CSV</a>}>
                <ul className="mt-1 space-y-0.5">{result.summary.errors.slice(0, 6).map((e, i) => <li key={i}>Row {e.row} · {e.field}: {e.message}</li>)}</ul>
              </Banner>
            )}
            {result.summary.warnings.length > 0 && <Banner tone="warn" className="mb-3" title={`${result.summary.warnings.length} warnings (rows still import)`}>{result.summary.warnings.slice(0, 3).map((w) => `Row ${w.row}: ${w.message}`).join(" · ")}</Banner>}
            <div className="text-[13px] font-semibold mb-2">Preview - first {result.preview.length} rows</div>
            <div className="overflow-auto max-h-80 border border-line rounded-[var(--radius-card)]">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface-2"><tr><th className="px-2 py-1.5 text-left">Row</th><th className="px-2 py-1.5 text-left">Check</th>{Object.keys(mapping).filter((c) => mapping[c]).slice(0, 6).map((c) => <th key={c} className="px-2 py-1.5 text-left font-mono whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{result.preview.map((p) => (
                  <tr key={p.row} className={cx("border-t border-line", p.errors.length > 0 && "bg-[var(--bad-bg)]")}>
                    <td className="px-2 py-1 num">{p.row}</td>
                    <td className="px-2 py-1">{p.errors.length ? <span title={p.errors.map((e) => `${e.field}: ${e.message}`).join("\n")} className="inline-flex items-center gap-1 text-[var(--bad-fg)]"><XCircle className="size-3.5" />{p.errors.length}</span> : <CheckCircle2 className="size-3.5 text-[var(--ok-fg)]" />}</td>
                    {Object.keys(mapping).filter((c) => mapping[c]).slice(0, 6).map((c) => <td key={c} className="px-2 py-1 max-w-48 truncate">{p.values[c]}</td>)}
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>Back to mapping</Button>
              <Button disabled={!result.summary.rows_valid} onClick={() => setConfirm(true)}>Import {fmtInt(result.summary.rows_valid)} valid rows</Button>
            </div>
          </div>
        )}
        {step === 4 && done && (
          <div className="text-center py-6">
            <CheckCircle2 className="size-9 mx-auto" style={{ color: "var(--ok-fg)" }} />
            <h3 className="mt-2 text-lg font-semibold">Import {done.reference} complete</h3>
            <p className="text-muted text-[13px] mt-1">{fmtInt(done.rows_inserted)} inserted · {fmtInt(done.rows_failed)} failed validation · {fmtInt(done.rows_duplicate)} duplicates skipped</p>
            <div className="mt-4 flex justify-center gap-2"><Link to={`/app/complaints?upload_id=${done.id}`} className="h-9 px-4 inline-flex items-center rounded-[var(--radius-control)] bg-primary text-white text-sm font-medium">View imported records</Link><Button variant="secondary" onClick={reset}>Import another file</Button></div>
          </div>
        )}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Import complaints?" loading={commit.isPending} onConfirm={() => commit.mutate()} confirmLabel="Import"
        body={result ? `${fmtInt(result.summary.rows_valid)} rows will be added to the complaint register. ${fmtInt(result.summary.rows_with_errors)} rows with errors and ${fmtInt(result.summary.duplicates_in_file + result.summary.duplicates_existing)} duplicates will be skipped. This is recorded in the audit log.` : ""} />
    </Card>
  );
}

function History() {
  const q = useQuery({ queryKey: ["uploads"], queryFn: () => api.get<{ items: UploadRec[] }>("/api/uploads") });
  const tone = (s: string) => (s === "imported" ? "ok" : s === "failed" ? "bad" : s === "cancelled" ? "neu" : "info") as "ok" | "bad" | "neu" | "info";
  return (
    <Card bodyClass="p-0">
      <DataTable caption="Import history" rows={q.data?.items} rowKey={(u) => u.id} loading={q.isLoading} error={q.error} columns={[
        { key: "r", header: "Import", cell: (u) => <Mono className="text-[12px]">{u.reference}</Mono> },
        { key: "f", header: "File", cell: (u) => <span className="block max-w-64 truncate" title={u.original_filename}>{u.original_filename}{u.is_synthetic_source && <ProvenanceBadge kind="demo" label="Synthetic" className="ml-2" />}</span> },
        { key: "by", header: "By", hideBelow: "lg", cell: (u) => u.created_by },
        { key: "at", header: "When", hideBelow: "lg", cell: (u) => fmtDateTime(u.created_at) },
        { key: "s", header: "Status", cell: (u) => <Pill tone={tone(u.status)}>{u.status}</Pill> },
        { key: "ok", header: "Inserted", align: "right", cell: (u) => fmtInt(u.rows_inserted) },
        { key: "bad", header: "Failed", align: "right", cell: (u) => fmtInt(u.rows_failed) },
        { key: "dup", header: "Duplicates", align: "right", hideBelow: "lg", cell: (u) => fmtInt(u.rows_duplicate) },
        { key: "v", header: "", cell: (u) => u.status === "imported" ? <Link to={`/app/complaints?upload_id=${u.id}`} className="text-link text-[12px] hover:underline whitespace-nowrap">View records</Link> : null },
      ]} mobileCard={(u) => <div><div className="flex justify-between"><Mono className="text-[12px]">{u.reference}</Mono><Pill tone={tone(u.status)}>{u.status}</Pill></div><div className="text-[13px] truncate">{u.original_filename}</div><div className="text-[12px] text-muted">{fmtInt(u.rows_inserted)} inserted · {fmtInt(u.rows_failed)} failed</div></div>} />
    </Card>
  );
}

function Quality() {
  const { data: caps } = useCapabilities();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Supplied datasets">
        <ul className="space-y-2 text-[13px]">
          <li className="flex items-center justify-between gap-2"><span className="font-mono text-[12px]">01_ABT_CPD_Complaints_18000.csv</span><Pill tone="ok">Imported</Pill></li>
          {caps?.missing_datasets.map((d) => <li key={d} className="flex items-center justify-between gap-2"><span className="font-mono text-[12px] break-all">{d}</span><Pill tone="warn" icon={<AlertTriangle className="size-3" />}>Not supplied</Pill></li>)}
        </ul>
        <p className="text-[12px] text-muted mt-3">The data-quality profile of every supplied file is documented in docs/DATA_QUALITY_REPORT.md.</p>
      </Card>
      <Card title="Data origin">
        <p className="text-[13px] text-ink-2">{fmtInt(caps?.data.synthetic_complaints)} of {fmtInt(caps?.data.complaints)} stored complaints are synthetic demonstration records (data_origin = SYNTHETIC_ABT_CPD). Manually entered and uploaded records are stored with their own origin.</p>
      </Card>
    </div>
  );
}

export default function DataManagement() {
  const { get, set } = useUrlState();
  const tab = get("tab", "upload");
  return (
    <>
      <PageHeader title="Data management" description="Import complaint files through validation, review import history and check what data is available." />
      <div className="mb-4"><CountTabs label="Data management" value={tab} onChange={(t) => set({ tab: t })} tabs={[{ id: "upload", label: "Upload" }, { id: "history", label: "Import history" }, { id: "quality", label: "Data availability" }]} /></div>
      {tab === "history" ? <History /> : tab === "quality" ? <Quality /> : <Wizard />}
    </>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useUrlState } from "../../hooks/useUrlState";
import { Button, Card, KeyValue, Mono, PageHeader, Pill, type Tone } from "../../components/ui/primitives";
import { CountTabs, DataTable } from "../../components/ui/DataTable";
import { Field, SearchInput, Select, Textarea } from "../../components/ui/forms";
import { Drawer, useToast } from "../../components/ui/overlays";
import { fmtDate, fmtDateTime } from "../../utils/format";

type B = { id: number; reference: string; full_name: string; organisation: string; job_role: string | null; email: string; phone: string | null; preferred_date: string; time_slot: string; timezone: string;
  purpose: string; status: string; internal_notes: string | null; notification_status: string | null; created_at: string; updated_at: string };
const TONE: Record<string, Tone> = { new: "info", contacted: "warn", scheduled: "ok", completed: "neu", cancelled: "neu" };
const STATUSES = ["new", "contacted", "scheduled", "completed", "cancelled"];

export default function Bookings() {
  const { get, set } = useUrlState();
  const status = get("status", "all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<B | null>(null);
  const [form, setForm] = useState({ status: "", internal_notes: "" });
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["bookings", status, q], queryFn: () => api.get<{ items: B[]; counts: Record<string, number> }>("/api/demo-bookings", { status: status === "all" ? undefined : status, q }) });
  useEffect(() => { const ref = get("ref"); if (ref && list.data) { const b = list.data.items.find((x) => x.reference === ref); if (b) setSel(b); } }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel) setForm({ status: sel.status, internal_notes: sel.internal_notes ?? "" }); }, [sel]);
  const save = useMutation({ mutationFn: () => api.patch<B>(`/api/demo-bookings/${sel!.reference}`, form), onSuccess: () => { toast("ok", "Booking updated"); qc.invalidateQueries({ queryKey: ["bookings"] }); setSel(null); } });
  return (
    <>
      <PageHeader title="Demo bookings" description="Requests from the public demo form. This workflow is separate from complaint data and never touches a model." />
      <Card bodyClass="p-0">
        <div className="px-4 pt-2"><CountTabs label="Booking status" value={status} onChange={(s) => set({ status: s === "all" ? null : s, ref: null })}
          tabs={[{ id: "all", label: "All", count: list.data?.counts.all ?? 0 }, ...STATUSES.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1), count: list.data?.counts[s] ?? 0 }))]} /></div>
        <div className="p-4 border-b border-line"><SearchInput value={q} onChange={setQ} placeholder="Name, organisation, email or reference" className="w-80 max-md:w-full" /></div>
        <DataTable caption="Demo bookings" rows={list.data?.items} rowKey={(b) => b.id} loading={list.isLoading} error={list.error} onRowClick={setSel} columns={[
          { key: "r", header: "Reference", cell: (b) => <Mono className="text-[12px]">{b.reference}</Mono> },
          { key: "n", header: "Name", cell: (b) => b.full_name },
          { key: "o", header: "Organisation", cell: (b) => b.organisation },
          { key: "slot", header: "Preferred slot", cell: (b) => `${fmtDate(b.preferred_date)} ${b.time_slot}` },
          { key: "at", header: "Submitted", hideBelow: "lg", cell: (b) => fmtDateTime(b.created_at) },
          { key: "s", header: "Status", cell: (b) => <Pill tone={TONE[b.status]}>{b.status}</Pill> },
        ]} mobileCard={(b) => <div><div className="flex justify-between"><span className="font-medium">{b.full_name}</span><Pill tone={TONE[b.status]}>{b.status}</Pill></div><div className="text-[12px] text-muted">{b.organisation} · {fmtDate(b.preferred_date)} {b.time_slot}</div></div>} />
      </Card>
      <Drawer open={!!sel} onOpenChange={(o) => { if (!o) { setSel(null); set({ ref: null }, false); } }} title={sel ? `${sel.reference} · ${sel.full_name}` : ""}
        footer={<><Button variant="secondary" onClick={() => setSel(null)}>Close</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        {sel && (
          <div className="space-y-5">
            <KeyValue items={[["Organisation", sel.organisation], ["Role", sel.job_role], ["Email", <a href={`mailto:${sel.email}`} className="text-link hover:underline break-all">{sel.email}</a>], ["Phone", sel.phone],
              ["Preferred slot", `${fmtDate(sel.preferred_date)} ${sel.time_slot}`], ["Time zone", sel.timezone], ["Submitted", fmtDateTime(sel.created_at)], ["Admin notification", sel.notification_status]]} />
            <div><div className="text-[12px] font-medium text-muted">Purpose</div><p className="text-[13px] mt-1 whitespace-pre-wrap">{sel.purpose}</p></div>
            <Field label="Status" htmlFor="b-status"><Select id="b-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={STATUSES} /></Field>
            <Field label="Internal notes" optional htmlFor="b-notes"><Textarea id="b-notes" rows={4} value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} /></Field>
          </div>
        )}
      </Drawer>
    </>
  );
}

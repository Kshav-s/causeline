import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useUrlState } from "../../hooks/useUrlState";
import { Card, Mono, PageHeader } from "../../components/ui/primitives";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { Select } from "../../components/ui/forms";
import { fmtDateTime } from "../../utils/format";

type Row = { id: number; user: string; action: string; entity_type: string | null; entity_id: string | null; details: Record<string, unknown> | null; ip_address: string | null; created_at: string };
const ACTIONS = ["auth", "complaint", "ml", "prediction", "upload", "booking", "user", "report"];

export default function Audit() {
  const { get, set } = useUrlState();
  const action = get("action"), page = Number(get("page", "1"));
  const q = useQuery({ queryKey: ["audit", action, page], placeholderData: keepPreviousData, queryFn: () => api.get<{ items: Row[]; total: number }>("/api/admin/audit", { action, page, page_size: 50 }) });
  return (
    <>
      <PageHeader title="Audit log" description="Read-only record of sign-ins, edits, analyses, reviews, imports and administrative actions."
        actions={<Select aria-label="Filter by action" value={action} onChange={(e) => set({ action: e.target.value })} placeholder="All actions" options={ACTIONS} className="w-44" />} />
      <Card bodyClass="p-0">
        <DataTable caption="Audit log" rows={q.data?.items} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} compact columns={[
          { key: "t", header: "When", cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.created_at)}</span> },
          { key: "u", header: "User", cell: (r) => r.user },
          { key: "a", header: "Action", cell: (r) => <Mono className="text-[12px]">{r.action}</Mono> },
          { key: "e", header: "Entity", cell: (r) => r.entity_id ? <span className="text-[12px]">{r.entity_type} <Mono className="text-[12px]">{r.entity_id}</Mono></span> : "—" },
          { key: "d", header: "Details", hideBelow: "lg", cell: (r) => <span className="block max-w-96 truncate text-[12px] text-muted font-mono" title={JSON.stringify(r.details)}>{r.details ? JSON.stringify(r.details) : ""}</span> },
          { key: "ip", header: "IP", hideBelow: "xl", cell: (r) => <Mono className="text-[12px]">{r.ip_address ?? "—"}</Mono> },
        ]} mobileCard={(r) => <div><div className="flex justify-between"><Mono className="text-[12px]">{r.action}</Mono><span className="text-[11px] text-muted">{fmtDateTime(r.created_at)}</span></div><div className="text-[12px]">{r.user} {r.entity_id && `· ${r.entity_id}`}</div></div>} />
        {q.data && <Pagination page={page} pageSize={50} total={q.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
      </Card>
    </>
  );
}

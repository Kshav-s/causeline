import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Plus, SlidersHorizontal } from "lucide-react";
import { api, downloadUrl } from "../../services/api";
import { useUrlState } from "../../hooks/useUrlState";
import { useAuth } from "../../hooks/auth";
import { Button, Card, Mono, PageHeader, SeverityPill, StatusPill } from "../../components/ui/primitives";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { FilterChips, Input, MultiSelect, SearchInput } from "../../components/ui/forms";
import { Drawer } from "../../components/ui/overlays";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { daysBetween, fmtDate, fmtInt } from "../../utils/format";
import type { ComplaintListItem } from "../../types/api";

type ListResp = { items: ComplaintListItem[]; total: number; tab_counts: Record<string, number> };
type Filters = { products: string[]; categories: string[]; severities: string[]; statuses: string[] };
const ARRAYS = ["product", "category", "severity", "status"] as const;

export default function Complaints() {
  const { get, getAll, set } = useUrlState();
  const nav = useNavigate();
  const { user } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(get("q"));
  useEffect(() => { const t = setTimeout(() => q !== get("q") && set({ q }), 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const tab = get("tab", "all"), sort = get("sort", "complaint_received_date"), order = (get("order", "desc") as "asc" | "desc");
  const page = Number(get("page", "1")), pageSize = Number(get("size", "25"));
  const params = {
    q: get("q"), tab, sort, order, page, page_size: pageSize, date_from: get("from"), date_to: get("to"), batch: get("batch"), upload_id: get("upload_id"),
    capa_id: get("capa_id"), prior_capa_id: get("prior_capa_id"), root_cause: get("root_cause"),
    product: getAll("product"), category: getAll("category"), severity: getAll("severity"), status: getAll("status"),
  };
  const list = useQuery({ queryKey: ["complaints", params], queryFn: () => api.get<ListResp>("/api/complaints", params), placeholderData: keepPreviousData });
  const opts = useQuery({ queryKey: ["complaint-filters"], queryFn: () => api.get<Filters>("/api/complaints/filters"), staleTime: 300_000 });

  const chips = [
    ...ARRAYS.flatMap((k) => getAll(k).map((v) => ({ key: `${k}:${v}`, label: v, onRemove: () => set({ [k]: getAll(k).filter((x) => x !== v) }) }))),
    ...(["from", "to", "batch", "upload_id", "capa_id", "prior_capa_id", "root_cause"] as const).filter((k) => get(k)).map((k) => ({
      key: k, label: `${{ from: "From", to: "To", batch: "Batch", upload_id: "Import", capa_id: "CAPA", prior_capa_id: "Recurrence of CAPA", root_cause: "Root cause" }[k]}: ${get(k)}`, onRemove: () => set({ [k]: null }) })),
  ];
  const clearAll = () => { setQ(""); set(Object.fromEntries([...ARRAYS, "from", "to", "q", "batch", "upload_id", "capa_id", "prior_capa_id", "root_cause"].map((k) => [k, null]))); };
  const onSort = (k: string) => set({ sort: k, order: sort === k && order === "desc" ? "asc" : "desc" });

  const cols: Column<ComplaintListItem>[] = [
    { key: "id", header: "Complaint ID", sortKey: "complaint_id", cell: (r) => (
      <div className="flex flex-col items-start gap-0.5">
        <Link to={`/app/complaints/${r.complaint_id}`} className="font-mono text-[12px] text-link hover:underline" onClick={(e) => e.stopPropagation()}>{r.complaint_id}</Link>
        {r.is_synthetic && <ProvenanceBadge kind="demo" className="!h-[18px] !text-[10px]" />}
      </div>) },
    { key: "date", header: "Received", sortKey: "complaint_received_date", align: "right", cell: (r) => fmtDate(r.complaint_received_date) },
    { key: "product", header: "Product", sortKey: "product_name", cell: (r) => <span className="block max-w-56 truncate" title={r.product_name}>{r.product_name}</span> },
    { key: "batch", header: "Batch", hideBelow: "2xl", cell: (r) => r.batch_id ? <Mono className="text-[12px] whitespace-nowrap">{r.batch_id}</Mono> : <span className="text-faint">Not supplied</span> },
    { key: "cat", header: "Category", sortKey: "complaint_category", cell: (r) => (
      <div className="max-w-60">
        {r.complaint_category ? <span className="block truncate" title={r.complaint_category}>{r.complaint_category}</span> : <span className="text-faint">Not recorded</span>}
        {r.category_source === "human_verified" && <ProvenanceBadge kind="human" label="Verified" className="mt-0.5" />}
        {!r.complaint_category && r.nlp_prediction && <ProvenanceBadge kind="nlp" label={`Predicted: ${r.nlp_prediction.label}`} className="mt-0.5 max-w-60 truncate" />}
      </div>) },
    { key: "sev", header: "Severity", sortKey: "complaint_severity", cell: (r) => <SeverityPill value={r.complaint_severity} /> },
    { key: "status", header: "Status", sortKey: "complaint_status", cell: (r) => <StatusPill value={r.complaint_status} /> },
    { key: "owner", header: "Owner", hideBelow: "2xl", cell: (r) => r.owner ?? <span className="text-faint">—</span> },
    { key: "age", header: "Age", align: "right", hideBelow: "lg", cell: (r) => {
      const d = daysBetween(r.complaint_received_date, r.complaint_closed_date);
      const open = r.complaint_status !== "Closed";
      return <span className={open && d > 60 ? "text-[var(--bad-fg)] font-medium" : open && d > 30 ? "text-[var(--warn-fg)] font-medium" : ""} title={open ? "Days since received" : "Days to closure"}>{fmtInt(d)}d</span>;
    } },
  ];

  const filterControls = (
    <>
      <MultiSelect label="Product" options={opts.data?.products ?? []} value={getAll("product")} onChange={(v) => set({ product: v })} />
      <MultiSelect label="Category" options={opts.data?.categories ?? []} value={getAll("category")} onChange={(v) => set({ category: v })} />
      <MultiSelect label="Severity" options={opts.data?.severities ?? []} value={getAll("severity")} onChange={(v) => set({ severity: v })} />
      <MultiSelect label="Status" options={opts.data?.statuses ?? []} value={getAll("status")} onChange={(v) => set({ status: v })} />
      <div className="flex items-center gap-1.5">
        <label htmlFor="cf-from" className="sr-only">Received from</label><Input id="cf-from" type="date" value={get("from")} onChange={(e) => set({ from: e.target.value })} className="w-[150px]" />
        <span className="text-muted text-[13px]">–</span>
        <label htmlFor="cf-to" className="sr-only">Received to</label><Input id="cf-to" type="date" value={get("to")} onChange={(e) => set({ to: e.target.value })} className="w-[150px]" />
      </div>
    </>
  );

  return (
    <>
      <PageHeader title="Complaint register" description="Every stored complaint. Recorded values are shown as recorded; model predictions are labelled."
        actions={<>
          <a href={downloadUrl("/api/complaints/export.csv", { ...params, page: undefined, page_size: undefined, tab: undefined, sort: undefined, order: undefined })}
            className="h-9 px-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-sm font-medium hover:bg-surface-hover"><Download className="size-4" />Export CSV</a>
          {user && <Button icon={<Plus className="size-4" />} onClick={() => nav("/app/complaints/new")}>New complaint</Button>}
        </>} />
      <Card bodyClass="p-0">
        <div className="px-4 pt-2"><CountTabs label="Complaint status" value={tab} onChange={(t) => set({ tab: t === "all" ? null : t })}
          tabs={[{ id: "all", label: "All", count: list.data?.tab_counts.all }, { id: "active", label: "Not closed", count: list.data?.tab_counts.active }, { id: "open", label: "Open", count: list.data?.tab_counts.open },
            { id: "investigating", label: "Under investigation", count: list.data?.tab_counts.investigating }, { id: "closed", label: "Closed", count: list.data?.tab_counts.closed }]} /></div>
        <div className="p-4 border-b border-line">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search ID, text, batch, product" className="w-[280px] max-md:flex-1" label="Search complaints" />
            <div className="max-md:hidden flex flex-wrap items-center gap-2">{filterControls}</div>
            <Button variant="secondary" className="md:hidden" icon={<SlidersHorizontal className="size-4" />} onClick={() => setFiltersOpen(true)}>Filters{chips.length ? ` (${chips.length})` : ""}</Button>
          </div>
          <FilterChips chips={chips} onClear={clearAll} />
        </div>
        <DataTable caption="Complaints" columns={cols} rows={list.data?.items} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          sort={{ key: sort, order }} onSort={onSort} onRowClick={(r) => nav(`/app/complaints/${r.complaint_id}`)}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2"><Mono className="text-[12px] text-link">{r.complaint_id}</Mono><StatusPill value={r.complaint_status} /></div>
              {r.is_synthetic && <ProvenanceBadge kind="demo" />}
              <div className="text-[13px] text-ink truncate">{r.product_name}</div>
              <div className="flex items-center justify-between text-[12px] text-muted"><SeverityPill value={r.complaint_severity} /><span>{fmtDate(r.complaint_received_date)}</span></div>
            </div>
          )} />
        {list.data && <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={(p) => set({ page: String(p) }, false)} onPageSize={(n) => set({ size: String(n) })} />}
      </Card>
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" footer={<><Button variant="secondary" onClick={clearAll}>Clear all</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></>}>
        <div className="flex flex-col items-start gap-3">{filterControls}</div>
      </Drawer>
    </>
  );
}

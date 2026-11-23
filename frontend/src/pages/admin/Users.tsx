import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../hooks/auth";
import type { User } from "../../types/api";
import { Banner, Button, Card, PageHeader, Pill } from "../../components/ui/primitives";
import { DataTable } from "../../components/ui/DataTable";
import { Field, Input, Select } from "../../components/ui/forms";
import { ConfirmDialog, Modal, useToast } from "../../components/ui/overlays";
import { fmtDateTime } from "../../utils/format";

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ items: User[] }>("/api/admin/users") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "analyst", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [toggle, setToggle] = useState<User | null>(null);
  const create = useMutation({ mutationFn: () => api.post("/api/admin/users", form),
    onSuccess: () => { toast("ok", "User created"); setOpen(false); setForm({ email: "", full_name: "", role: "analyst", password: "" }); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => setErr(e instanceof ApiError ? (e.fieldErrors.map((f) => `${f.field}: ${f.message}`).join("; ") || e.message) : "Failed") });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<User> }) => api.patch(`/api/admin/users/${id}`, body),
    onSuccess: () => { toast("ok", "User updated"); setToggle(null); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => { setToggle(null); toast("bad", e instanceof Error ? e.message : "Failed"); } });
  return (
    <>
      <PageHeader title="Users & roles" description="Administrators manage users, bookings and models. Analysts work with complaints, analysis and data." actions={<Button icon={<UserPlus className="size-4" />} onClick={() => { setErr(null); setOpen(true); }}>Add user</Button>} />
      <Card bodyClass="p-0">
        <DataTable caption="Users" rows={list.data?.items} rowKey={(u) => u.id} loading={list.isLoading} error={list.error} columns={[
          { key: "n", header: "Name", cell: (u) => <span className="font-medium">{u.full_name}{u.id === me?.id && <span className="text-muted font-normal"> (you)</span>}</span> },
          { key: "e", header: "Email", cell: (u) => u.email },
          { key: "r", header: "Role", cell: (u) => <Select aria-label={`Role for ${u.full_name}`} value={u.role} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as User["role"] } })} options={[{ value: "admin", label: "Admin" }, { value: "analyst", label: "Analyst" }]} className="w-32 h-8" /> },
          { key: "s", header: "Status", cell: (u) => <Pill tone={u.is_active ? "ok" : "neu"}>{u.is_active ? "Active" : "Deactivated"}</Pill> },
          { key: "l", header: "Last sign-in", hideBelow: "lg", cell: (u) => fmtDateTime(u.last_login_at) },
          { key: "a", header: "", cell: (u) => u.id !== me?.id && <Button size="sm" variant={u.is_active ? "ghost" : "secondary"} onClick={() => setToggle(u)}>{u.is_active ? "Deactivate" : "Reactivate"}</Button> },
        ]} mobileCard={(u) => <div className="flex justify-between"><div><div className="font-medium">{u.full_name}</div><div className="text-[12px] text-muted">{u.email} · {u.role}</div></div><Pill tone={u.is_active ? "ok" : "neu"}>{u.is_active ? "Active" : "Off"}</Pill></div>} />
      </Card>
      <Modal open={open} onOpenChange={setOpen} title="Add user" description="Share the initial password securely; ask the user to change it after first sign-in."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Create user</Button></>}>
        <div className="space-y-3">
          {err && <Banner tone="bad">{err}</Banner>}
          <Field label="Full name" required htmlFor="u-name"><Input id="u-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email" required htmlFor="u-email"><Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" required htmlFor="u-role"><Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={[{ value: "analyst", label: "Analyst" }, { value: "admin", label: "Admin" }]} /></Field>
          <Field label="Initial password" required htmlFor="u-pw" help="At least 10 characters with upper- and lower-case letters and a digit."><Input id="u-pw" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)} danger={toggle?.is_active} loading={update.isPending}
        title={toggle?.is_active ? `Deactivate ${toggle?.full_name}?` : `Reactivate ${toggle?.full_name}?`}
        body={toggle?.is_active ? "They will be signed out and unable to sign in. Their past actions stay in the audit log." : "They will be able to sign in again."}
        confirmLabel={toggle?.is_active ? "Deactivate" : "Reactivate"} onConfirm={() => toggle && update.mutate({ id: toggle.id, body: { is_active: !toggle.is_active } })} />
    </>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../hooks/auth";
import type { User } from "../../types/api";
import { Banner, Button, Card, KeyValue, PageHeader } from "../../components/ui/primitives";
import { Field, Input, Select } from "../../components/ui/forms";
import { useToast } from "../../components/ui/overlays";
import { fmtDateTime } from "../../utils/format";

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? "");
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const prefs = useMutation({ mutationFn: (b: Partial<User>) => api.patch<User>("/api/auth/me", b), onSuccess: (u) => { setUser(u); toast("ok", "Preferences saved"); } });
  const change = useMutation({
    mutationFn: () => api.post("/api/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password }),
    onSuccess: () => { toast("ok", "Password changed"); setPw({ current_password: "", new_password: "", confirm: "" }); },
    onError: (e) => setPwErr(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : "Could not change password"),
  });
  if (!user) return null;
  return (
    <>
      <PageHeader title="Settings" description="Your profile, display preferences and password." />
      <div className="grid gap-4 xl:grid-cols-2 max-w-5xl">
        <Card title="Profile">
          <KeyValue items={[["Email", user.email], ["Role", <span className="capitalize">{user.role}</span>], ["Last sign-in", fmtDateTime(user.last_login_at)], ["Member since", fmtDateTime(user.created_at)]]} />
          <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) prefs.mutate({ full_name: name.trim() }); }}>
            <div className="flex-1"><Field label="Display name" htmlFor="s-name"><Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
            <Button type="submit" variant="secondary" loading={prefs.isPending}>Save</Button>
          </form>
        </Card>
        <Card title="Display">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Theme" htmlFor="s-theme"><Select id="s-theme" value={user.theme} onChange={(e) => prefs.mutate({ theme: e.target.value as User["theme"] })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></Field>
            <Field label="Table density" htmlFor="s-density"><Select id="s-density" value={user.table_density} onChange={(e) => prefs.mutate({ table_density: e.target.value as User["table_density"] })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} /></Field>
          </div>
        </Card>
        <Card title="Change password">
          <form noValidate className="space-y-3" onSubmit={(e) => {
            e.preventDefault(); setPwErr(null);
            if (pw.new_password !== pw.confirm) return setPwErr("New passwords do not match.");
            if (pw.new_password.length < 10) return setPwErr("Use at least 10 characters.");
            change.mutate();
          }}>
            {pwErr && <Banner tone="bad">{pwErr}</Banner>}
            <Field label="Current password" htmlFor="pw-c"><Input id="pw-c" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" htmlFor="pw-n" help="At least 10 characters with upper- and lower-case letters and a digit."><Input id="pw-n" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <Field label="Confirm new password" htmlFor="pw-r"><Input id="pw-r" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button type="submit" loading={change.isPending}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));
export const fmtPct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(digits)}%`);
export const fmtNum = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "—" : n.toFixed(digits));

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s.endsWith("Z") || s.includes("+") ? s : `${s}Z`);
  return isNaN(d.getTime()) ? s : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysBetween(from: string, to?: string | null) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = to ? new Date(`${to}T00:00:00`).getTime() : Date.now();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

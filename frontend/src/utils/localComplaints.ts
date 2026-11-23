/** Complaints raised from this browser. The access key is the visitor's own secret; it is kept only on their device. */
export type SavedComplaint = { id: string; key: string; product: string; at: string; sig?: string };
const K = "causeline:my-complaints";

export function savedComplaints(): SavedComplaint[] {
  try { return JSON.parse(localStorage.getItem(K) || "[]"); } catch { return []; }
}
export function saveComplaint(c: SavedComplaint) {
  localStorage.setItem(K, JSON.stringify([c, ...savedComplaints().filter((x) => x.id !== c.id)].slice(0, 20)));
}
export function keyFor(id: string): string | undefined {
  return savedComplaints().find((c) => c.id === id)?.key;
}
export function forgetComplaint(id: string) {
  localStorage.setItem(K, JSON.stringify(savedComplaints().filter((c) => c.id !== id)));
}

/** Content signature (FNV-1a of normalised product + description) - lets the form warn before the same complaint is sent twice. */
export function complaintSignature(product: string, description: string): string {
  const s = `${product}|${description}`.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
export function findBySignature(sig: string): SavedComplaint | undefined {
  return savedComplaints().find((c) => c.sig === sig);
}

/** One random token per form session; the server rejects a second submission carrying the same token. */
export function newSubmissionToken(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

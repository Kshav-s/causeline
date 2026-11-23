/** Complaints raised from this browser. The access key is the visitor's own secret; it is kept only on their device. */
export type SavedComplaint = { id: string; key: string; product: string; at: string };
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

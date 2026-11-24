// Visual verification (CLAUDE.md §20): full-page desktop + mobile screenshots of every route,
// plus console-error and horizontal-overflow checks.
// Usage: CL_EMAIL=... CL_PASSWORD=... node e2e/screenshots.mjs <outDir> [routeFilter]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CL_BASE ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "screenshots";
const filter = process.argv[3];
fs.mkdirSync(out, { recursive: true });

const PUBLIC = [["home", "/"], ["raise", "/raise"], ["register", "/register"], ["track", "/track"], ["staff-login", "/staff"]];
const APP = [["overview", "/app"], ["complaints", "/app/complaints"], ["complaints-historical", "/app/complaints?sort=complaint_received_date&order=asc"], ["complaint-detail", "/app/complaints/ABT-CMP-2007-014934"], ["complaint-new", "/app/complaints/new"],
  ["ai", "/app/ai"], ["ai-queue", "/app/ai?tab=queue"], ["root-cause", "/app/root-cause"], ["capa", "/app/capa"], ["capa-detail", "/app/capa/ABT-CAPA-000001"], ["risk", "/app/risk"],
  ["risk-repeat", "/app/risk?tab=repeat"], ["zombie-capa", "/app/capa/zombies"], ["zombie-capa-detail", "/app/capa/ABT-CAPA-001940"], ["simulator", "/app/simulator"], ["risk-batches", "/app/risk?tab=history"], ["risk-score", "/app/risk?tab=score"], ["analytics", "/app/analytics"], ["data", "/app/data"], ["data-history", "/app/data?tab=history"],
  ["reports", "/app/reports"], ["settings", "/app/settings"], ["admin-users", "/app/admin/users"], ["admin-models", "/app/admin/models"], ["admin-audit", "/app/admin/audit"]];
const VIEWPORTS = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]];

const browser = await chromium.launch();
// one real public complaint (with a photo) so the visitor result page can be captured
const setup = await (await browser.newContext()).request;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC", "base64");
const sub = await setup.post(BASE + "/api/public/complaints", { multipart: { customer_name: "Screenshot Check", product_name: "Sliced sandwich bread", complaint_date: new Date().toISOString().slice(0, 10),
  description: "Green mould spots visible on several slices of a sealed loaf, well before the best-before date.", severity: "Major",
  images: { name: "loaf.png", mimeType: "image/png", buffer: png } } });
if (!sub.ok()) throw new Error(`public submit failed ${sub.status()} ${await sub.text()}`);
const { complaint_id: CID, access_key: KEY } = await sub.json();
PUBLIC.push(["complaint-result", `/complaint/${CID}?new=1#key=${encodeURIComponent(KEY)}`]);
APP.push(["staff-public-complaint", `/app/complaints/${CID}`]);
const report = [];
for (const [vpName, vp] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const shoot = async (name, url) => {
    if (filter && !name.includes(filter)) return;
    errors.length = 0;
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    // scroll through once so scroll-reveal sections are shown, then back to the top
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = path.join(out, `${name}-${vpName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({ name, vp: vpName, overflow, errors: [...errors] });
  };
  for (const [n, u] of PUBLIC) await shoot(n, u);
  const r = await page.request.post(BASE + "/api/auth/login", { data: { email: process.env.CL_EMAIL, password: process.env.CL_PASSWORD } });
  if (!r.ok()) throw new Error(`login failed ${r.status()}`);
  for (const [n, u] of APP) await shoot(n, u);
  await ctx.close();
}
await browser.close();
for (const r of report) console.log(`${r.overflow > 0 ? "OVERFLOW " + r.overflow + "px" : "ok"}\t${r.vp}\t${r.name}${r.errors.length ? "\tERRORS: " + r.errors.slice(0, 3).join(" | ") : ""}`);

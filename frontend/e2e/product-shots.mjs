// Real product screenshots for the home page tour (frontend/public/product/*.png).
// Run against the ISOLATED stack so no genuine submission can appear in a public image:
//   CL_BASE=http://localhost:5174 CL_EMAIL=... CL_PASSWORD=... CL_ANALYSIS_ID=CL-2026-000119 node e2e/product-shots.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.CL_BASE ?? "http://localhost:5174";
const OUT = "public/product";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const shot = async (name, url, scrollTo) => {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  if (scrollTo) { await page.getByText(scrollTo, { exact: false }).first().scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -90)); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
};
await shot("register", "/register?category=Packaging+issue&category=Physical+defect+%2F+foreign+matter&sort=severity&order=desc", "Complaint ID");
const r = await page.request.post(BASE + "/api/auth/login", { data: { email: process.env.CL_EMAIL, password: process.env.CL_PASSWORD } });
if (!r.ok()) throw new Error(`login failed ${r.status()}`);
await shot("dashboard", "/app");
await shot("analysis", `/app/complaints/${process.env.CL_ANALYSIS_ID}`, "Evidence summary");
await shot("zombie-capa", "/app/capa/zombies");
await shot("simulator", "/app/simulator");
await browser.close();

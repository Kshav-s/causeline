import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.CL_EMAIL ?? "";
const PASSWORD = process.env.CL_PASSWORD ?? "";
// 1x1 PNGs (valid images, decoded by the backend)
const PNG_RED = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC", "base64");
const PNG_BLUE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQkzsBAAFiAQURG6MhAAAAAElFTkSuQmCC", "base64");

const DESC = () => `E2E ${Date.now()}: hard plastic fragment found inside a sealed yoghurt cup after opening.`;

async function fillSteps(page: Page, description: string, withPhotos = true, product = "Set yoghurt") {
  await expect(page.getByRole("navigation", { name: "Complaint form progress" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();                          // step 1 validated before moving on
  await expect(page.getByText("Enter your name")).toBeVisible();
  await page.getByLabel("Your name").fill("E2E Visitor");
  await page.getByLabel("Email").fill("visitor@example.com");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();                          // step 2 validated
  await expect(page.getByText("Describe the problem in at least 20 characters")).toBeVisible();
  await page.getByLabel("Product name or code").fill(product);
  await page.getByLabel("How serious is it?").selectOption("Major");
  await page.getByLabel("What happened?").fill(description);
  await page.getByRole("button", { name: "Next" }).click();
  if (withPhotos) {
    await page.getByLabel("Choose photos").setInputFiles([
      { name: "cup.png", mimeType: "image/png", buffer: PNG_RED },
      { name: "lid.png", mimeType: "image/png", buffer: PNG_BLUE },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
    ]);
    await expect(page.getByRole("img", { name: /cup\.png/ })).toBeVisible();          // preview before submission
    await expect(page.getByText("Only JPG, PNG or WEBP")).toBeVisible();              // bad file flagged client-side
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Remove the photos marked with a problem")).toBeVisible();
    await page.getByRole("button", { name: "Remove notes.txt" }).click();             // remove before submission
  }
  await page.getByRole("button", { name: "Next" }).click();
  const review = page.getByRole("region", { name: "Review your complaint" });          // review step shows what will be sent
  await expect(review.getByText(description)).toBeVisible();
  await expect(review.getByText("E2E Visitor")).toBeVisible();
}

async function raise(page: Page, product?: string) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByText(/request a demo/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Raise a Complaint" }).first().click();
  await expect(page).toHaveURL(/\/raise$/);
  await fillSteps(page, DESC(), true, product);
  await page.getByRole("button", { name: "Submit complaint" }).click();
  await expect(page).toHaveURL(/\/complaint\/CL-\d{4}-\d{6}/, { timeout: 30_000 });
  return page.url().match(/CL-\d{4}-\d{6}/)![0];
}

test("duplicate protection: the same complaint sent again from this device is caught before a second record is made", async ({ page }) => {
  const d = DESC();
  await page.goto("/raise");
  await fillSteps(page, d, false);
  await page.getByRole("button", { name: "Submit complaint" }).click();
  await expect(page).toHaveURL(/\/complaint\/CL-\d{4}-\d{6}/, { timeout: 30_000 });
  const id = page.url().match(/CL-\d{4}-\d{6}/)![0];
  await page.goto("/raise");
  await fillSteps(page, d, false);
  await page.getByRole("button", { name: "Submit complaint" }).click();
  await expect(page.getByText("You have already sent this complaint")).toBeVisible();
  await expect(page.getByRole("link", { name: `Open ${id}` })).toBeVisible();
  await expect(page).toHaveURL(/\/raise$/);                                           // nothing sent
});

test("visitor: raise complaint with photos -> reference -> real AI analysis -> register, no login", async ({ page }) => {
  const id = await raise(page);
  await expect(page.getByText("Complaint received - save these details")).toBeVisible();
  await expect(page.getByRole("heading", { name: id })).toBeVisible();
  const cat = page.getByRole("region", { name: "Complaint category" });
  await expect(cat).toBeVisible();
  await expect(cat.getByText(/Complaint category classifier/)).toBeVisible();         // model name + version
  await expect(cat.getByText(/PRD-\d{6}/)).toBeVisible();                              // persisted prediction
  await expect(cat.getByRole("button", { name: "Confirm" })).toHaveCount(0);          // visitors cannot review
  await expect(page.getByText(/Escalate for food-safety review/)).toBeVisible();       // "plastic" keyword rule
  await expect(page.getByRole("region", { name: "Similar historical complaints" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Photos" }).getByRole("img")).toHaveCount(2);
  await expect(page.getByText("Model disclaimer.")).toBeVisible();
  const tl = page.getByRole("region", { name: "Investigation timeline" });                // complainant-safe history
  await expect(tl.getByText("Complaint received")).toBeVisible();
  await expect(tl.getByText(/AI analysis (partly )?completed/)).toBeVisible();
  const ev = page.getByRole("region", { name: "Evidence summary" });                    // six evidence types kept apart
  for (const t of ["Recorded information", "NLP prediction", "Similarity scores", "Root-cause hypotheses", "Food-safety alert", "Human-verified findings"])
    await expect(ev.getByText(t, { exact: true })).toBeVisible();
  await page.reload();                                                                  // persisted + key remembered on device
  await expect(page.getByRole("region", { name: "Complaint category" })).toBeVisible();
  await page.goto(`/register?q=${id}`);
  // table on desktop, cards on mobile - assert on whichever is visible
  await expect(page.getByText(id, { exact: true }).locator("visible=true").first()).toBeVisible();
  await expect(page.getByText(/AI suggestion/).locator("visible=true").first()).toBeVisible();
  await expect(page.getByText("E2E Visitor")).toHaveCount(0);                          // no personal data in register
});

test("privacy: another visitor cannot open the complaint or its photos", async ({ page, browser }) => {
  const id = await raise(page);
  const stranger = await browser.newContext();
  const p2 = await stranger.newPage();
  await p2.goto(`/complaint/${id}`);
  await expect(p2.getByText("Access key needed")).toBeVisible();
  await expect(p2.getByText("hard plastic fragment")).toHaveCount(0);
  expect((await p2.request.get(`/api/public/complaints/${id}`)).status()).toBe(404);
  expect((await p2.request.get(`/api/complaints/${id}`)).status()).toBe(401);
  await p2.goto("/app");
  await expect(p2).toHaveURL(/\/staff\?next=/);                                      // internal area stays protected
  await stranger.close();
});

test("staff: hidden /staff sign-in, complaint shows photos, complainant and notes", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set CL_EMAIL and CL_PASSWORD");
  const id = await raise(page);
  await page.goto("/staff");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`/app/complaints/${id}`);
  await expect(page.getByText("E2E Visitor")).toBeVisible();
  await expect(page.getByRole("img", { name: /Complaint photo/ })).toHaveCount(2);
  await page.getByLabel("New investigation note").fill("Retained sample requested from the store.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Retained sample requested from the store.")).toBeVisible();
});

test("full journey: submission -> AI analysis -> staff review -> root-cause suggestions -> confirmed cause -> complainant timeline -> reporting", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set CL_EMAIL and CL_PASSWORD");
  test.setTimeout(120_000);
  const id = await raise(page, "Plain set yoghurt");                                      // catalogue product -> food family known
  await page.goto("/staff");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  // staff review of the NLP suggestion (human verification before any root-cause model run)
  await page.goto(`/app/complaints/${id}`);
  const cat = page.getByRole("region", { name: "Complaint category" });
  await cat.getByRole("button", { name: "Correct…" }).click();
  await page.locator("#rv-label").selectOption("Physical defect / foreign matter");
  await page.locator("#rv-reason").fill("Fragment visible in the photos.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Review recorded")).toBeVisible();
  const rc = page.getByRole("region", { name: "Possible root causes" });
  await expect(rc.getByText(/Possible explanations to direct the investigation/)).toBeVisible({ timeout: 20_000 });
  // investigator records the confirmed cause (separate from the model's hypotheses)
  await page.getByRole("button", { name: "Record confirmed cause" }).click();
  await page.locator("#cc-cause").selectOption({ index: 1 });
  await page.locator("#cc-reason").fill("Retained sample analysis.");
  await page.getByRole("button", { name: "Record as confirmed" }).click();
  await expect(page.getByText("Confirmed root cause recorded")).toBeVisible();
  // the complainant sees the progress, labelled by source, without internal details
  await page.goto(`/complaint/${id}`);
  const tl = page.getByRole("region", { name: "Investigation timeline" });
  await expect(tl.getByText("Category set by the quality team: Physical defect / foreign matter")).toBeVisible();
  await expect(tl.getByText("Root-cause suggestions generated")).toBeVisible();
  await expect(tl.getByText(/^Root cause confirmed: /)).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence summary" }).getByText(/Category: Physical defect \/ foreign matter/)).toBeVisible();
  await expect(tl.getByText("Fragment visible in the photos.")).toHaveCount(0);           // staff reasons stay internal
  // reporting and quality views built from stored records
  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await page.goto("/app/capa/zombies");
  await expect(page.getByRole("heading", { name: "Zombie CAPA detector" })).toBeVisible();
  await expect(page.getByText(/Zombie CAPA = a CAPA recorded as closed/)).toBeVisible();
  await page.goto("/app/simulator");
  await expect(page.getByText("Estimates, not forecasts")).toBeVisible();
  await expect(page.getByText("Baseline complaints", { exact: true })).toBeVisible();
});

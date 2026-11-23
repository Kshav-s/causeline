import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.CL_EMAIL ?? "";
const PASSWORD = process.env.CL_PASSWORD ?? "";
// 1x1 PNGs (valid images, decoded by the backend)
const PNG_RED = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC", "base64");
const PNG_BLUE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQkzsBAAFiAQURG6MhAAAAAElFTkSuQmCC", "base64");

async function raise(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByText(/request a demo/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Raise a Complaint" }).first().click();
  await expect(page).toHaveURL(/\/raise$/);
  await page.getByRole("button", { name: "Submit complaint" }).click();          // client validation first
  await expect(page.getByText("Enter your name")).toBeVisible();
  await page.getByLabel("Your name").fill("E2E Visitor");
  await page.getByLabel("Email").fill("visitor@example.com");
  await page.getByLabel("Product name or code").fill("Set yoghurt");
  await page.getByLabel("How serious is it?").selectOption("Major");
  await page.getByLabel("What happened?").fill(`E2E ${Date.now()}: hard plastic fragment found inside a sealed yoghurt cup after opening.`);
  await page.getByLabel("Choose photos").setInputFiles([
    { name: "cup.png", mimeType: "image/png", buffer: PNG_RED },
    { name: "lid.png", mimeType: "image/png", buffer: PNG_BLUE },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
  ]);
  await expect(page.getByRole("img", { name: /cup\.png/ })).toBeVisible();          // preview before submission
  await expect(page.getByText("Only JPG, PNG or WEBP")).toBeVisible();              // bad file flagged client-side
  await page.getByRole("button", { name: "Remove notes.txt" }).click();             // remove before submission
  await page.getByRole("button", { name: "Submit complaint" }).click();
  await expect(page).toHaveURL(/\/complaint\/CL-\d{4}-\d{6}/, { timeout: 30_000 });
  return page.url().match(/CL-\d{4}-\d{6}/)![0];
}

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

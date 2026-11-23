import { expect, test } from "@playwright/test";

const EMAIL = process.env.CL_EMAIL ?? "";
const PASSWORD = process.env.CL_PASSWORD ?? "";

function nextWeekday() {
  const d = new Date(); d.setDate(d.getDate() + 3);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test("complaint: form -> backend -> DB -> ML inference -> stored result -> UI -> human review", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set CL_EMAIL and CL_PASSWORD");
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/app/complaints/new");
  await page.getByRole("button", { name: "Save & analyse" }).click();         // client-side validation first
  await expect(page.getByText(/need attention|needs attention/)).toBeVisible();
  await page.getByLabel("Product", { exact: false }).first().fill("Wheat flour");
  await page.getByLabel("Food family").selectOption("Grains & cereals");
  await page.getByLabel("Description").fill(`E2E ${Date.now()}: customer found live insects and webbing inside a sealed flour bag.`);
  await page.getByRole("button", { name: "Save & analyse" }).click();

  await expect(page).toHaveURL(/\/app\/complaints\/CL-\d{4}-\d{6}/);
  const panel = page.getByRole("region", { name: "Complaint category" });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/Complaint category classifier/)).toBeVisible();        // model name + version shown
  await expect(panel.getByText(/PRD-\d{6}/)).toBeVisible();                            // stored prediction id
  await expect(page.getByText(/insufficient data/i).first()).toBeVisible();           // root cause refuses without a category
  await panel.getByRole("button", { name: "Confirm" }).click();
  await expect(panel.getByText(/Confirmed by/)).toBeVisible();
  await page.reload();                                                                 // persisted, not front-end state
  await expect(page.getByRole("region", { name: "Complaint category" }).getByText(/Confirmed by/)).toBeVisible();
});

test("demo booking follows its own public workflow", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/demo");
  await page.getByRole("button", { name: "Request demo" }).click();
  await expect(page.getByText("Enter your full name")).toBeVisible();
  await page.getByLabel("Full name").fill("E2E Visitor");
  await page.getByLabel("Organisation").fill("Example Foods Ltd");
  await page.getByLabel("Work email").fill("visitor@example.com");
  await page.getByLabel("Preferred date").fill(nextWeekday());
  await page.getByLabel("Preferred time").selectOption("11:00");
  await page.getByLabel("What would you like to see?").fill("Complaint trends and CAPA follow-up for our plant.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request demo" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  await expect(page.getByText(/DMO-[0-9A-F]{6}/)).toBeVisible();
});

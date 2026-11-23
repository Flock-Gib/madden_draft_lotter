const { test, expect } = require("@playwright/test");

test("page navigation has distinct URLs, preserves lottery setup, and supports old links", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#ability-guide")).toBeHidden();
  await page.locator("#loadDemoBtn").click();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Ability Guide" }).click();
  await expect(page).toHaveURL(/\?page=ability/);
  await expect(page.locator("#ability-guide")).toBeVisible();
  await expect(page.locator("#setup")).toBeHidden();
  await expect(page.locator('.site-nav [aria-current="page"]')).toHaveText("Ability Guide");
  await page.reload();
  await expect(page.locator("#ability-guide")).toBeVisible();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "How it works" }).click();
  await page.reload();
  await expect(page.locator("#how-it-works")).toBeVisible();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Lottery" }).click();
  await expect(page.locator("#teamTableBody tr")).toHaveCount(8);
  await page.reload();
  await expect(page.locator("#teamTableBody tr")).toHaveCount(8);
  await page.goto("/#history");
  await expect(page.locator("#history")).toBeVisible();
  await expect(page.locator("#results")).toBeHidden();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Results" }).click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#history")).toBeHidden();
  await page.goBack();
  await expect(page.locator("#history")).toBeVisible();
});

test("Supabase callback opens history, verifies admin, and enables publishing after a year is saved", async ({ page }) => {
  let cloudDeletes = 0;
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "DELETE") cloudDeletes += 1;
    const body = url.includes("/auth/v1/user") ? { id: "admin", email: "admin@example.com" }
      : url.includes("/rpc/is_flockville_admin") ? true : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#access_token=example&refresh_token=example");
  await expect(page.locator("#history")).toBeVisible();
  await expect(page.locator("#supabaseStatus")).toContainText("no saved lottery years yet");
  await expect(page.locator("#supabaseLoadBtn")).toBeEnabled();
  await expect(page.locator("#supabasePublishBtn")).toBeDisabled();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#newHistoryBtn").click();
  await page.locator("#manualHistoryYear").fill("2025");
  await page.locator("#manualHistoryCompleteness").selectOption("top-three");
  const rows = page.locator("#manualHistoryRows > div");
  for (const [index, name] of ["Raiders", "Giants", "Titans"].entries()) {
    await rows.nth(index).locator(".history-pick").fill(String(index + 1));
    await rows.nth(index).locator(".history-team").fill(name);
  }
  await page.locator("#saveManualHistoryBtn").click();
  await expect(page.locator("#supabasePublishBtn")).toBeEnabled();
  await page.locator("#deleteHistoryYearBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("deleted from this browser and Supabase");
  expect(cloudDeletes).toBe(1);
});

test("unauthorized cloud accounts see an actionable error and can retry", async ({ page }) => {
  let cloudDeletes = 0;
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    if (route.request().method() === "DELETE") cloudDeletes += 1;
    const body = route.request().url().includes("/auth/v1/user") ? { email: "admin@example.com" } : false;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#access_token=example&refresh_token=example");
  await expect(page.locator("#supabaseStatus")).toContainText("not authorized");
  await expect(page.locator("#supabaseLoadBtn")).toBeEnabled();
  await expect(page.locator("#supabasePublishBtn")).toBeDisabled();
  await expect(page.locator("#supabaseSignOutBtn")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#newHistoryBtn").click();
  await page.locator("#manualHistoryYear").fill("2025");
  await page.locator("#manualHistoryCompleteness").selectOption("top-three");
  for (const [index, name] of ["Raiders", "Giants", "Titans"].entries()) {
    const row = page.locator("#manualHistoryRows > div").nth(index);
    await row.locator(".history-pick").fill(String(index + 1));
    await row.locator(".history-team").fill(name);
  }
  await page.locator("#saveManualHistoryBtn").click();
  await page.locator("#deleteHistoryYearBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("deleted from this browser only");
  expect(cloudDeletes).toBe(0);
});

test("switching pages during a reveal preserves the draw and saved results", async ({ page }) => {
  await page.goto("/");
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#setupLockBtn").click();
  await page.locator("#startLotteryBtn").click();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "History" }).click();
  await expect(page.locator("#history")).toBeVisible();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Lottery" }).click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Results" }).click();
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(8);
  await page.reload();
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(8);
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "History" }).click();
  await expect(page.locator("#historyYearSelect")).not.toHaveValue("");
});

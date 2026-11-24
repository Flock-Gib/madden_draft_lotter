const { test, expect } = require("@playwright/test");
const history = require("../flockville-draft-lottery/lottery-history.js");

async function mockArchive(page, { records = {}, admin = true } = {}) {
  const writes = [];
  const authRequests = [];
  let failWrites = false;
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = request.url();
    let body;
    if (url.includes("/auth/")) {
      authRequests.push(url);
      body = { id: "admin", email: "admin@example.com" };
    } else if (url.includes("/rpc/")) {
      authRequests.push(url);
      body = admin;
    } else if (request.method() === "POST") {
      const rows = request.postDataJSON();
      writes.push(rows);
      if (failWrites) {
        await route.fulfill({ status: 503, json: { message: "Archive temporarily unavailable" } });
        return;
      }
      rows.forEach((row) => { records[row.season_year] = row.record; });
      body = rows;
    } else {
      body = Object.entries(records).map(([year, record]) => ({ season_year: Number(year), record }));
    }
    await route.fulfill({ status: 200, json: body });
  });
  return { records, writes, authRequests, failWrites: (value) => { failWrites = value; } };
}

async function completeDemoDraw(page) {
  await page.goto("/?page=lottery");
  await page.locator("#loadDemoBtn").click();
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").press("Tab");
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#setupLockBtn").click();
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
}

test("admin sets a password after one email-link login, then signs in with it and publishes pending history", async ({ page }) => {
  const user = { id: "admin", email: "admin@example.com" };
  let write = null;
  let passwordSignIns = 0;
  let passwordChanges = 0;
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    const request = route.request();
    const url = request.url();
    let body;
    if (url.includes("grant_type=password")) {
      passwordSignIns++;
      expect(request.postDataJSON()).toEqual({ email: user.email, password: "Test password 123!" });
      body = { access_token: "password-access", refresh_token: "refresh", user, expires_in: 3600 };
    } else if (url.includes("/auth/v1/user") && request.method() === "PUT") {
      passwordChanges++;
      expect(request.postDataJSON()).toEqual({ password: "Test password 123!" });
      body = user;
    } else if (url.includes("/auth/v1/user")) body = user;
    else if (url.includes("/auth/v1/logout")) body = {};
    else if (url.includes("/rpc/")) body = true;
    else if (request.method() === "POST") {
      write = request.postDataJSON();
      body = write;
    } else body = write || [];
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/#access_token=example&refresh_token=example");
  await expect(page.locator("#supabaseStatus")).toContainText("no saved lottery years yet");
  await page.locator("#supabaseNewPassword").fill("Test password 123!");
  await page.locator("#supabaseConfirmPassword").fill("mismatch");
  await page.locator("#supabaseSetPasswordBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("same new password");
  expect(passwordChanges).toBe(0);
  await page.locator("#supabaseConfirmPassword").fill("Test password 123!");
  await page.locator("#supabaseSetPasswordBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("Password updated");
  await expect(page.locator("#supabaseNewPassword")).toHaveValue("");
  await page.locator("#supabaseSignOutBtn").click();
  await expect(page.locator("#supabasePasswordSetup")).toBeHidden();
  await completeDemoDraw(page);
  await expect(page.locator("#lotterySaveStatus")).toContainText("not yet in Supabase");
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "History" }).click();
  await page.locator("#supabaseEmail").fill(user.email);
  await page.locator("#supabasePassword").fill("Test password 123!");
  await page.locator("#supabasePassword").press("Enter");
  await expect(page.locator("#supabaseSignOutBtn")).toBeVisible();
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2026");
  expect(write[0].record.finalOrder).toHaveLength(8);
  await expect(page.locator("#supabasePublishBtn")).toBeEnabled();
  expect(passwordSignIns).toBe(1);
  expect(passwordChanges).toBe(1);
  const session = await page.evaluate(() => sessionStorage.getItem("flockvilleSupabaseSession"));
  expect(session).not.toContain("Test password 123!");
});

test("password login cannot grant publishing access to a non-admin", async ({ page }) => {
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    const url = route.request().url();
    const body = url.includes("grant_type=password")
      ? { access_token: "access", refresh_token: "refresh", user: { id: "user", email: "user@example.com" } }
      : url.includes("/rpc/") ? false : [];
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/?page=history");
  await expect(page.locator("#supabaseStatus")).toContainText("Anyone can read");
  await page.locator("#supabaseEmail").fill("user@example.com");
  await page.locator("#supabasePassword").fill("Test password 123!");
  await page.locator("#supabasePasswordSignInBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("not authorized");
  await expect(page.locator("#supabasePublishBtn")).toBeDisabled();
});

test("password sign-in failure is visible and does not enable publishing", async ({ page }) => {
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    if (route.request().url().includes("grant_type=password")) {
      await route.fulfill({ status: 400, json: { message: "Invalid login credentials" } });
    } else await route.fulfill({ status: 200, json: [] });
  });
  await page.goto("/?page=history");
  await expect(page.locator("#supabaseStatus")).toContainText("Anyone can read");
  await page.locator("#supabaseEmail").fill("admin@example.com");
  await page.locator("#supabasePassword").fill("wrong");
  await page.locator("#supabasePasswordSignInBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("Invalid login credentials");
  await expect(page.locator("#supabasePassword")).toHaveValue("");
  await expect(page.locator("#supabasePublishBtn")).toBeDisabled();
  await expect(page.locator("#supabasePasswordSetup")).toBeHidden();
});

test("public visitors can look up Supabase history and loaded teams are cross-checked", async ({ page }) => {
  const prior = history.createManualRecord({
    year: 2025, completeness: "top-three",
    finalOrder: ["Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens"]
      .map((team, index) => ({ pick: index + 1, team, owner: "Outside Owner" })),
  });
  const cloud = await mockArchive(page, { records: { 2025: prior } });
  await page.goto("/?page=history");
  await expect(page.locator("#historyYearSelect")).toHaveValue("2025");
  await expect(page.locator("#historyDetail")).toContainText("Arizona Cardinals");
  await expect(page.locator("#supabaseStatus")).toContainText("Anyone can read this archive");
  expect(cloud.authRequests).toEqual([]);
  await page.goto("/?page=lottery");
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").press("Tab");
  await page.locator("#loadAllNflBtn").click();
  await expect(page.locator("#teamCrossCheck")).toContainText("32 teams verified against 2025 history");
  await expect(page.locator("#teamCrossCheck")).toContainText("restriction was applied automatically");
  await expect(page.locator("#protectionSource")).toContainText("#1 — Arizona Cardinals");
  expect(cloud.writes).toEqual([]);
});

test("a completed signed-out draw stays pending across reload and publishes after admin sign-in", async ({ page }) => {
  const cloud = await mockArchive(page);
  await completeDemoDraw(page);
  await expect(page.locator("#lotterySaveStatus")).toContainText("2026 saved in this browser but not yet in Supabase");
  expect(cloud.writes).toHaveLength(0);
  await page.reload();
  await expect(page.locator("#lotterySaveStatus")).toContainText("Sign in as a league admin");
  await page.goto("/#access_token=example&refresh_token=example");
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2026");
  expect(cloud.writes).toHaveLength(1);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory")).lotteryHistory["2026"]);
  expect(cloud.records["2026"]).toEqual(saved);
  await page.reload();
  await expect(page.locator("#supabaseStatus")).toContainText("already present");
  expect(cloud.writes).toHaveLength(1);
});

test("imported flags are checked against original-team history without changing CPU locks or traded ownership", async ({ page }) => {
  const prior = history.createManualRecord({
    year: 2025, completeness: "top-three",
    finalOrder: ["Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens"]
      .map((team, index) => ({ pick: index + 1, team, owner: "Buffalo Bills" })),
  });
  await mockArchive(page, { records: { 2025: prior } });
  await page.goto("/?page=results");
  await expect(page.locator("#supabaseStatus")).toContainText("Anyone can read this archive");
  await page.locator("#importJsonInput").setInputFiles({
    name: "teams.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      seasonYear: 2026,
      teams: ["Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
        "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns"]
        .map((name, index) => ({
          id: `team-${index}`, name, owner: index === 0 ? "Buffalo Bills" : name,
          cpuLocked: index === 0, previousNumberOne: index === 3, previousTopThree: index === 3,
        })),
    })),
  });
  await page.locator("#importJsonBtn").click();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Lottery" }).click();
  await expect(page.locator("#teamCrossCheck")).toContainText("Buffalo Bills: loaded previous #1 was checked");
  await expect(page.locator("#teamCrossCheck")).toContainText("restriction is overridden; it keeps its slot");
  await expect(page.locator("#protectionSource")).toContainText("#1 — Arizona Cardinals");
  const setup = await page.evaluate(() => JSON.parse(localStorage.getItem("flockvilleDraftLotteryState")).teams);
  expect(setup[0].cpuLocked).toBe(true);
  expect(setup[0].owner).toBe("Buffalo Bills");
  await page.locator("#setupLockBtn").click();
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  const result = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory")).lotteryHistory["2026"]);
  expect(result.finalOrder[0]).toMatchObject({
    pick: 1, team: "Arizona Cardinals", owner: "Buffalo Bills", cpuLocked: true, balls: 0,
  });
});

test("a failed completed-draw save stays pending and Retry cloud save confirms the exact record", async ({ page }) => {
  const cloud = await mockArchive(page);
  await page.goto("/#access_token=example&refresh_token=example");
  await expect(page.locator("#supabaseStatus")).toContainText("no saved lottery years yet");
  cloud.failWrites(true);
  await completeDemoDraw(page);
  await expect(page.locator("#lotterySaveStatus")).toContainText("Supabase did not confirm 2026");
  expect(cloud.records["2026"]).toBeUndefined();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleCloudPendingYears")))).toEqual(["2026"]);
  cloud.failWrites(false);
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "History" }).click();
  await page.locator("#cloudRetryBtn").click();
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2026");
  expect(cloud.records["2026"].finalOrder).toHaveLength(8);
  expect(cloud.writes).toHaveLength(2);
  await expect(page.locator("#cloudRetryBtn")).toBeHidden();
});

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
      : url.includes("/rpc/is_flockville_admin") ? true
        : route.request().method() === "POST" ? route.request().postDataJSON()
          : route.request().method() === "DELETE" ? [{ season_year: 2025 }] : [];
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
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2025");
  await expect(page.locator("#supabasePublishBtn")).toBeEnabled();
  await page.locator("#deleteHistoryYearBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("deleted from this browser and Supabase");
  expect(cloudDeletes).toBe(1);
});

test("unauthorized cloud accounts see an actionable error and can retry", async ({ page }) => {
  let cloudDeletes = 0;
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    if (route.request().method() === "DELETE") cloudDeletes += 1;
    const body = route.request().url().includes("/auth/v1/user") ? { email: "admin@example.com" }
      : route.request().url().includes("/rpc/is_flockville_admin") ? false : [];
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

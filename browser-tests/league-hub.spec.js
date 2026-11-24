const fs = require("node:fs/promises");
const { test, expect } = require("@playwright/test");
const history = require("../flockville-draft-lottery/lottery-history.js");
const HOST = "https://ybortnssqkjvrzggmfeb.supabase.co/**";

function backend({ records = {}, admin = true, missing = false } = {}) {
  const data = {
    records, dashboard: { season_year: 2027, announcements: "Welcome to Flockville\nDraft night soon", event_title: "League draft", event_at: null },
    room: null, broadcasts: [], corrections: [], audit: [], failBroadcast: false,
  };
  data.install = async (page) => page.route(HOST, async (route) => {
    const request = route.request();
    const url = request.url();
    const input = request.method() === "POST" ? request.postDataJSON() : null;
    let json;
    if (url.includes("/auth/")) json = { id: "admin", email: "admin@example.com" };
    else if (url.includes("/is_flockville_admin")) json = admin;
    else if (url.includes("/correct_flockville_history")) {
      data.corrections.push(input);
      const before = data.records[input.p_year];
      data.audit.unshift({ id: 1, season_year: input.p_year, action: input.p_record ? "UPDATE" : "DELETE",
        reason: input.p_reason, before_record: before, after_record: input.p_record, created_at: new Date().toISOString() });
      if (input.p_record) data.records[input.p_year] = input.p_record;
      else delete data.records[input.p_year];
      json = input.p_record || before;
    } else if (url.includes("/publish_flockville_live")) {
      data.broadcasts.push(input);
      data.room = { run_id: input.p_run_id, season_year: input.p_year, total: input.p_total,
        status: input.p_status, picks: input.p_picks, revision: (data.room?.revision || 0) + 1, updated_at: new Date().toISOString() };
      json = data.room;
    } else if (url.includes("/flockville_live?")) {
      if (data.failBroadcast) return route.fulfill({ status: 503, json: { message: "Connection unavailable" } });
      json = data.room ? [data.room] : [];
    } else if (url.includes("/flockville_dashboard")) {
      if (missing) return route.fulfill({ status: 404, json: { message: "Table not installed" } });
      if (input) data.dashboard = input;
      json = [data.dashboard];
    } else if (url.includes("/draft_lottery_audit")) json = data.audit;
    else if (input) {
      input.forEach(({ season_year, record }) => { data.records[season_year] = record; });
      json = input;
    } else json = Object.entries(data.records).map(([year, record]) => ({ season_year: Number(year), record }));
    return route.fulfill({ status: 200, json });
  });
  return data;
}

function saved(year = 2026) {
  return history.createManualRecord({ year, completeness: "top-three",
    finalOrder: ["Bears", "Ravens", "Lions"].map((team, index) => ({ pick: index + 1, team, owner: team })) });
}

test("home is public, shows real league updates and hides commissioner editing", async ({ page }) => {
  const server = backend({ records: { 2026: saved() } });
  await server.install(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-page", "home");
  await expect(page.locator("#homeStats")).toContainText("2027");
  await expect(page.locator("#homeStats")).toContainText("2026 · #1 Bears");
  await expect(page.locator("#homeAnnouncements")).toContainText("Welcome to Flockville");
  await expect(page.locator("#homeEvent")).toHaveText("League draft · Time to be announced");
  await expect(page.locator("#hubSaveBtn")).toBeHidden();
  await page.getByRole("navigation").getByRole("link", { name: "Lottery", exact: true }).click();
  await expect(page.locator("#setup")).toBeHidden();
  await expect(page.locator("#startLotteryBtn")).toBeHidden();
  await page.getByRole("navigation").getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.locator("#memberResults")).toContainText("Bears");
  await page.getByRole("navigation").getByRole("link", { name: "History", exact: true }).click();
  await expect(page.locator("#newHistoryBtn")).toBeHidden();
  await expect(page.locator("#supabasePasswordSignInBtn")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize().width);
  expect(errors).toEqual([]);
});

test("commissioner publishes escaped dashboard content with confirmed save", async ({ page }) => {
  const server = backend();
  await server.install(page);
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("body")).toHaveAttribute("data-commissioner", "true");
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await page.locator("#home details summary").click();
  await page.locator("#hubSeason").fill("2028");
  await page.locator("#hubAnnouncements").fill('<img src=x onerror="alert(1)">\nLeague news');
  await page.locator("#hubEventTitle").fill("Season kickoff");
  await page.locator("#hubSaveBtn").click();
  await expect(page.locator("#hubStatus")).toContainText("saved to Supabase and confirmed");
  await expect(page.locator("#homeAnnouncements")).toContainText("<img src=x");
  await expect(page.locator("#homeAnnouncements img")).toHaveCount(0);
  expect(server.dashboard.season_year).toBe(2028);
  await page.reload();
  await expect(page.locator("#homeStats")).toContainText("2028");
});

test("commissioner can find both season settings and finalize a saved year for other viewers", async ({ page, context }) => {
  const server = backend({ records: { 2025: saved(2025), 2026: { ...saved(), finalized: true } } });
  await server.install(page);
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("body")).toHaveAttribute("data-commissioner", "true");
  await expect(page.locator("#seasonHistoryList")).toContainText("2026 season");
  await expect(page.locator("#historyDetail")).toContainText("Finalized");
  await page.locator("#historyYearSelect").selectOption("2025");
  await expect(page.locator("#historyDetail")).toContainText("not finalized");
  await expect(page.locator("#finalizeHistoryYearBtn")).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#finalizeHistoryYearBtn").click();
  expect(server.records[2025].finalized).not.toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#finalizeHistoryYearBtn").click();
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2025");
  await expect(page.locator("#finalizeHistoryYearBtn")).toHaveText("Year Finalized");
  expect(server.records[2025].finalized).toBe(true);
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await page.locator("#home details summary").click();
  await page.locator("#hubSeason").fill("2028");
  await page.locator("#hubSaveBtn").click();
  await expect(page.locator("#hubStatus")).toContainText("confirmed");
  await page.getByRole("link", { name: "Set lottery year" }).click();
  await expect(page.locator("#seasonYearInput")).toBeVisible();
  await page.locator("#seasonYearInput").fill("2029");
  await page.locator("#seasonYearInput").press("Tab");
  await expect(page.locator("#seasonYearInput")).toHaveValue("2029");
  await page.getByRole("navigation").getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.locator("#finalizeSeasonBtn")).toBeVisible();
  await expect(page.locator("#finalizeSeasonBtn")).toBeDisabled();
  const spectator = await context.browser().newContext();
  const viewer = await spectator.newPage();
  await server.install(viewer);
  await viewer.goto("/?page=history");
  await expect(viewer.locator("#seasonHistoryList")).toContainText("2025 season");
  await expect(viewer.locator("#seasonHistoryList")).toContainText("2026 season");
  await expect(viewer.locator("#finalizeHistoryYearBtn")).toBeHidden();
  await expect(viewer.locator("#seasonHistoryList .history-item")).toHaveCount(2);
  await spectator.close();
});

test("missing upgrade and interrupted, stale or failed broadcasts have explicit states", async ({ page }) => {
  const server = backend({ missing: true });
  await server.install(page);
  await page.goto("/");
  await expect(page.locator("#hubStatus")).toContainText("run the updated supabase/schema.sql");
  await page.getByRole("navigation").getByRole("link", { name: "Watch live" }).click();
  await expect(page.locator("#liveStatus")).toContainText("No broadcast yet");
  server.room = { run_id: "one", season_year: 2027, total: 8, status: "live", picks: [],
    revision: 1, updated_at: "2020-01-01T00:00:00Z" };
  await expect(page.locator("#liveStatus")).toContainText("paused or disconnected", { timeout: 8000 });
  server.room = { ...server.room, status: "interrupted", revision: 2 };
  await expect(page.locator("#liveStatus")).toContainText("not a completed lottery", { timeout: 8000 });
  server.failBroadcast = true;
  await expect(page.locator("#liveStatus")).toContainText("connection failed", { timeout: 8000 });
  server.failBroadcast = false;
  server.room = { ...server.room, status: "complete", total: 2, revision: 3,
    picks: [{ pick: 1, team: "Bears", owner: "Ravens", cpuLocked: true }, { pick: 2, team: "Ravens", owner: "Ravens" }] };
  await expect(page.locator("#liveStatus")).toContainText("Complete", { timeout: 8000 });
  await expect(page.locator("#livePicks")).toContainText("CPU / locked");
});

test("a separate spectator receives only revealed picks and the completed broadcast", async ({ page, context }) => {
  test.setTimeout(60_000);
  const server = backend();
  await server.install(page);
  const spectator = await context.newPage();
  await server.install(spectator);
  await spectator.goto("/?page=live");
  await expect(spectator.locator("#liveStatus")).toContainText("No broadcast yet");
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("body")).toHaveAttribute("data-commissioner", "true");
  await page.getByRole("navigation").getByRole("link", { name: "Lottery", exact: true }).click();
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#setupLockBtn").click();
  await page.locator("#broadcastEnabled").check();
  await page.locator("#startLotteryBtn").click();
  await expect(spectator.locator("#liveStatus")).toContainText("Live", { timeout: 10000 });
  expect(server.broadcasts[0].p_picks).toEqual([]);
  await expect(spectator.locator("#livePicks li")).not.toHaveCount(0, { timeout: 15000 });
  expect(server.broadcasts.at(-1).p_picks.length).toBeLessThan(8);
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete", { timeout: 20000 });
  await expect(spectator.locator("#liveStatus")).toContainText("Complete", { timeout: 10000 });
  await expect(spectator.locator("#livePicks li")).toHaveCount(8);
  for (const [index, call] of server.broadcasts.entries()) {
    expect(Object.keys(call).sort()).toEqual(["p_picks", "p_run_id", "p_start", "p_status", "p_total", "p_year"]);
    for (const pick of call.p_picks) expect(Object.keys(pick).sort()).toEqual(["cpuLocked", "owner", "pick", "team"]);
    if (index) expect(call.p_picks.slice(0, server.broadcasts[index - 1].p_picks.length)).toEqual(server.broadcasts[index - 1].p_picks);
  }
  await spectator.close();
});

test("finalized deletion requires a reason and offers the database backup for recovery", async ({ page }) => {
  const original = { ...saved(), finalized: true };
  const server = backend({ records: { 2026: original } });
  await server.install(page);
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("#historyDetail")).toContainText("Bears");
  const cancel = async (dialog) => dialog.type() === "prompt" ? dialog.dismiss() : dialog.accept();
  page.on("dialog", cancel);
  await page.locator("#deleteHistoryYearBtn").click();
  expect(server.records[2026]).toEqual(original);
  expect(server.corrections).toHaveLength(0);
  page.off("dialog", cancel);
  page.on("dialog", (dialog) => dialog.accept(dialog.type() === "prompt" ? "Remove duplicate finalized draw" : undefined));
  await page.locator("#deleteHistoryYearBtn").click();
  await expect(page.locator("#supabaseStatus")).toContainText("deleted from this browser and Supabase");
  expect(server.corrections[0]).toMatchObject({ p_year: 2026, p_record: null, p_reason: "Remove duplicate finalized draw" });
  await page.locator("#hubAuditLoadBtn").locator("..").locator("summary").click();
  await page.locator("#hubAuditLoadBtn").click();
  await expect(page.locator("#hubAuditLog")).toContainText("Remove duplicate finalized draw");
  const pending = page.waitForEvent("download");
  await page.locator("[data-backup]").click();
  const download = await pending;
  const exported = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(exported.lotteryHistory["2026"].finalOrder).toEqual(original.finalOrder);
  expect(exported._checksum).toMatch(/^[a-f0-9]{64}$/);
  await page.locator("#importHistoryInput").setInputFiles(await download.path());
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#historyDetail")).toContainText("Bears");
});

test("an interrupted reveal retains the already-broadcast prefix without saving a partial draw", async ({ page }) => {
  const server = backend();
  await server.install(page);
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("body")).toHaveAttribute("data-commissioner", "true");
  await page.getByRole("navigation").getByRole("link", { name: "Lottery", exact: true }).click();
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#setupLockBtn").click();
  await page.locator("#broadcastEnabled").check();
  await page.evaluate(() => {
    const original = renderResults;
    renderResults = (...args) => {
      if (state.isRunning && state.results.length === 2) throw new Error("Injected reveal failure");
      return original(...args);
    };
  });
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("no completed draw was saved");
  expect(server.room.status).toBe("interrupted");
  expect(server.room.picks).toHaveLength(2);
  expect(server.broadcasts.at(-1).p_picks).toEqual(server.broadcasts.at(-2).p_picks);
  expect(server.records).toEqual({});
});

test("canceling a finalized import preserves history; approving records an explicit correction", async ({ page }) => {
  const original = { ...saved(), finalized: true };
  const replacement = { ...original, finalOrder: original.finalOrder.map((pick, index) =>
    ({ ...pick, team: index === 0 ? "Jets" : pick.team, owner: index === 0 ? "Jets" : pick.owner })) };
  const server = backend({ records: { 2026: original } });
  await server.install(page);
  await page.goto("/#access_token=access&refresh_token=refresh");
  await expect(page.locator("#historyDetail")).toContainText("Bears");
  const input = {
    name: "correction.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(history.buildHistoryExport({ 2026: replacement }))),
  };
  const cancel = (dialog) => dialog.type() === "prompt" ? dialog.dismiss() : dialog.accept();
  page.on("dialog", cancel);
  await page.locator("#importHistoryInput").setInputFiles(input);
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#historyDetail")).toContainText("Bears");
  expect(server.corrections).toHaveLength(0);
  expect(server.records[2026]).toEqual(original);
  page.off("dialog", cancel);
  page.on("dialog", (dialog) => dialog.accept(dialog.type() === "prompt" ? "Correct transcribed original team" : undefined));
  await page.locator("#importHistoryInput").setInputFiles(input);
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#cloudSyncState")).toContainText("Saved to Supabase and confirmed: 2026");
  expect(server.corrections[0].p_reason).toBe("Correct transcribed original team");
  expect(server.records[2026].finalOrder[0].team).toBe("Jets");
});

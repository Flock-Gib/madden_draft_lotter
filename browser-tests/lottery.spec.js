const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

test.beforeEach(async ({ page }) => {
  page.__pageErrors = [];
  page.on("pageerror", (error) => page.__pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors).toEqual([]);
});

/** Configure a reproducible demo without requiring a previous season. */
async function demo(page) {
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#seedEnabledToggle").check();
  await page.locator("#seedInput").fill("browser-regression");
  await page.locator("#seedInput").press("Tab");
}

/** Capture a downloaded file without writing fixtures into the repository. */
async function download(page, selector) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  const file = await pending;
  return { file, content: await fs.readFile(await file.path(), "utf8") };
}

test("add team, lock, draw, export, reload, and import history", async ({ page }) => {
  test.setTimeout(90_000);
  await page.locator("#teamNameInput").selectOption("Arizona Cardinals");
  await page.locator("#addTeamBtn").click();
  await expect(page.locator("#teamTableBody tr")).toHaveCount(1);
  await demo(page);
  await page.locator("#setupLockBtn").click();
  await expect(page.locator("#addTeamBtn")).toBeDisabled();
  await page.locator("#startLotteryBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete", { timeout: 60_000 });
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(8);
  const backup = await download(page, "#exportHistoryBtn");
  const payload = JSON.parse(backup.content);
  expect(payload._checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(payload.lotteryHistory)).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(8);
  await page.locator("#deleteHistoryYearBtn").click();
  await page.locator("#importHistoryInput").setInputFiles({
    name: backup.file.suggestedFilename(), mimeType: "application/json", buffer: Buffer.from(backup.content),
  });
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#historyDetail")).toContainText(Object.keys(payload.lotteryHistory)[0]);
  const liveOrder = await page.locator("#resultsGrid").innerText();
  const beforeBracket = await page.evaluate(() => ({ ...localStorage }));
  await page.locator("#playoffTeamCount").fill("6");
  await page.locator("#generateBracketBtn").click();
  await expect(page.locator("#bracketPanel")).toContainText("BYE");
  await expect(page.locator("#bracketPanel .bracket-match")).toHaveCount(4);
  const bracket = await download(page, "#exportBracketCsvBtn");
  expect(bracket.content).toContain("HomeSeed");
  expect(await page.locator("#resultsGrid").innerText()).toEqual(liveOrder);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(beforeBracket);
  await page.locator("#tradeFromInput").selectOption("Arizona Cardinals");
  await page.locator("#tradeToInput").selectOption("Atlanta Falcons");
  await page.locator("#tradeAssetsInput").fill("2027 Round 1 Pick");
  await page.locator("#saveTradeBtn").click();
  const beforeReview = await page.evaluate(() => ({ ...localStorage }));
  await page.locator("#finalizeSeasonBtn").click();
  await expect(page.locator("#finalizeDialog")).toBeVisible();
  await page.locator("#finalizeTradeList .review-notes").fill("Reviewed league trade");
  await page.locator("#cancelFinalizeBtn").click();
  await expect(page.locator("#tradeList")).not.toContainText("Reviewed league trade");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(beforeReview);
  await page.locator("#finalizeSeasonBtn").click();
  await page.locator("#finalizeTradeList .review-remove").click();
  await page.locator("#confirmFinalizeBtn").click();
  await expect(page.locator("#finalizeDialog")).toBeHidden();
  const saved = await page.evaluate((year) => JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory")).lotteryHistory[year],
    Object.keys(payload.lotteryHistory)[0]);
  expect(saved.finalized).toBe(true);
  expect(saved.reviewedTrades).toEqual([]);
});

test("manual past draft supplies next year's flags", async ({ page }) => {
  await demo(page);
  await page.locator("#manualProtectionToggle").uncheck();
  await page.locator("#newHistoryBtn").click();
  await page.locator("#manualHistoryYear").fill("2025");
  await page.locator("#manualHistoryCompleteness").selectOption("top-three");
  const rows = page.locator("#manualHistoryRows > div");
  for (const [index, team] of ["Raiders", "Giants", "Titans"].entries()) {
    await rows.nth(index).locator(".history-pick").fill(String(index + 1));
    await rows.nth(index).locator(".history-team").fill(team);
  }
  await page.locator("#saveManualHistoryBtn").click();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2025");
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").dispatchEvent("change");
  await expect(page.locator("#protectionSource")).toContainText("2025");
  await expect(page.locator("#teamTableBody .previous-number-one:checked")).toHaveCount(1);
  await expect(page.locator("#teamTableBody .previous-top-three:checked")).toHaveCount(3);
  await page.reload();
  await expect(page.locator("#historyDetail")).toContainText("2025");
});

test("only the last trade can be undone and CSV preserves columns", async ({ page }) => {
  await demo(page);
  for (let index = 1; index <= 3; index += 1) {
    await page.locator("#tradeFromInput").selectOption("Arizona Cardinals");
    await page.locator("#tradeToInput").selectOption("Atlanta Falcons");
    await page.locator("#tradeAssetsInput").fill(`2027 Round ${index} Pick`);
    await page.locator("#saveTradeBtn").click();
  }
  await expect(page.locator("#tradeList .trade-item")).toHaveCount(3);
  const csv = await download(page, "#exportTradesCsvBtn");
  expect(csv.content).toContain("Pick#,FromTeam,ToTeam,FromPick,ToPick,Notes,AutoGenerated");
  await page.locator("#undoTradeBtn").click();
  await expect(page.locator("#tradeList .trade-item")).toHaveCount(2);
  await expect(page.locator("#undoTradeBtn")).toBeDisabled();
  await expect(page.locator(".toast").last()).toContainText(/undone|undo/i);
});

test("dry run is isolated, exportable, and can be discarded", async ({ page }) => {
  await demo(page);
  await page.locator("#setupLockBtn").click();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.locator("#dryRunBtn").click();
  await expect(page.locator("#dryRunPanel")).toBeVisible();
  await expect(page.locator("#dryRunPanel")).toContainText("DRY RUN");
  await expect(page.locator("#dryRunResults")).toContainText("#1");
  await expect(page.locator("#dryRunSnapshotSummary")).toContainText("Snapshot year:");
  await expect(page.locator("#dryRunSnapshotSummary")).toContainText("Snapshot rules:");
  await expect(page.locator("#dryRunSnapshotSummary")).toContainText("browser-regression");
  await expect(page.locator("#dryRunSnapshotSummary")).toContainText("Teams: 8");
  await expect(page.locator("#dryRunSnapshotSummary")).toContainText("later setup changes do not update this preview");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  const backup = await download(page, "#exportDryRunBtn");
  expect(JSON.parse(backup.content)._checksum).toMatch(/^[a-f0-9]{64}$/);
  await page.locator("#discardDryRunBtn").click();
  await expect(page.locator("#dryRunPanel")).toBeHidden();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
});

test("recovery previews intact records and merges only on explicit action", async ({ page }) => {
  const record = {
    year: 2024, source: "manual", completeness: "top-three", archived: true,
    finalOrder: ["A", "B", "C"].map((team, index) => ({ team, pick: index + 1 })),
  };
  const corrupt = `{"lotteryHistory":{"2024":${JSON.stringify(record)},"2025":{"year":2025,"finalOrder":[`;
  await page.locator("#recoveryText").fill(corrupt);
  await page.locator("#previewRecoveryBtn").click();
  await expect(page.locator("#recoveryPreview")).toContainText("2024");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory") || "{}").lotteryHistory?.["2024"])).toBeUndefined();
  await page.locator("#mergeRecoveryBtn").click();
  const recovered = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory")).lotteryHistory["2024"]);
  expect(recovered.archived).toBe(true);
  expect(recovered.finalOrder.map(({ pick, team }) => ({ pick, team }))).toEqual(record.finalOrder);
  await page.locator("#showArchivedToggle").check();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2024");
  await expect(page.locator("#historyDetail")).toContainText("2024");
  await page.locator("#archiveHistoryYearBtn").click();
  await page.locator("#showArchivedToggle").uncheck();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2024");
  await page.reload();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2024");
});

test("mobile cards have touch-friendly working reorder buttons", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only layout assertion");
  await demo(page);
  await expect(page.locator("#mobileTeamList")).toBeVisible();
  await expect(page.locator("#teamTableBody")).toBeHidden();
  const first = page.locator("#mobileTeamList > *").first();
  await expect(first.locator(".mobile-team-heading strong")).toHaveText("#1 Raiders");
  await page.locator("#seedInput").fill("mobile-seed-blur-regression");
  const down = first.getByRole("button", { name: /down|↓/i });
  const box = await down.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await down.click();
  await expect(page.locator("#mobileTeamList > *").first().locator(".mobile-team-heading strong")).toHaveText("#1 Giants");
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleDraftLotteryState")).teams[0].name)).toBe("Giants");
  await page.reload();
  await expect(page.locator("#mobileTeamList > *").first().locator(".mobile-team-heading strong")).toHaveText("#1 Giants");
  const card = page.locator("#mobileTeamList > *").first();
  for (const control of await card.locator("select, input, button").all()) {
    const target = await control.boundingBox();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await card.locator(".mobile-name").selectOption("Arizona Cardinals");
  await card.locator(".mobile-owner").selectOption("Atlanta Falcons");
  await card.locator(".previous-top-three").check();
  await card.locator(".previous-number-one").check();
  await page.reload();
  await expect(card.locator(".mobile-name")).toHaveValue("Arizona Cardinals");
  await expect(card.locator(".mobile-owner")).toHaveValue("Atlanta Falcons");
  await expect(card.locator(".previous-top-three")).toBeChecked();
  await expect(card.locator(".previous-number-one")).toBeChecked();
  await page.locator("#setupLockBtn").click();
  for (const control of await card.locator("select, input, button").all()) {
    await expect(control).toBeDisabled();
  }
  await page.locator("#setupLockBtn").click();
  await card.locator(".mobile-remove").click();
  await expect(page.locator("#mobileTeamList > *")).toHaveCount(7);
  await page.reload();
  await expect(page.locator("#mobileTeamList > *")).toHaveCount(7);
});

test("dry-run save requires a new year and keeps the live order empty", async ({ page }) => {
  await demo(page);
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").dispatchEvent("change");
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#dryRunBtn").click();
  const simulatedBackup = await download(page, "#exportDryRunBtn");
  const simulatedOrder = JSON.parse(simulatedBackup.content).lotteryHistory["2026"].finalOrder;
  await page.locator("#dryRunYearInput").fill("2026");
  await page.locator("#saveDryRunBtn").click();
  await expect(page.locator("#dryRunPanel")).toBeVisible();
  await page.locator("#dryRunYearInput").fill("2027");
  await page.locator("#saveDryRunBtn").click();
  await expect(page.locator("#dryRunPanel")).toBeHidden();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2027");
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(0);
  const savedSimulation = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("flockvilleDraftLotteryHistory")).lotteryHistory["2027"]);
  expect(savedSimulation.source).toBe("dry-run");
  const orderIdentity = (order) => order.map(({ pick, team, owner, originalSlot, balls, note }) =>
    ({ pick, team, owner, originalSlot, balls, note }));
  expect(orderIdentity(savedSimulation.finalOrder)).toEqual(orderIdentity(simulatedOrder));
  await page.reload();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2027");
});

test("per-flag override is independent and clearing it resyncs history", async ({ page }) => {
  await demo(page);
  await page.locator("#manualProtectionToggle").uncheck();
  const record = {
    year: 2025, source: "manual", completeness: "top-three",
    finalOrder: ["Raiders", "Giants", "Titans"]
      .map((team, index) => ({ team, pick: index + 1 })),
  };
  await page.locator("#importHistoryInput").setInputFiles({
    name: "prior.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ lotteryHistory: { 2025: record } })),
  });
  await page.locator("#importHistoryBtn").click();
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").dispatchEvent("change");
  await expect(page.locator("#flagSourcePanel")).toContainText("2025");
  await page.locator("#overrideNumberOneBtn").click();
  await expect(page.locator("#flagOverrideDialog")).toContainText(/the other flag's source is unchanged/i);
  await page.locator("#flagOverrideTeams input").first().uncheck();
  await page.locator("#flagOverrideTeams input").nth(3).check();
  await page.locator("#saveFlagOverrideBtn").click();
  await expect(page.locator("#teamTableBody .previous-top-three:checked")).toHaveCount(3);
  await expect(page.locator("#teamTableBody tr").nth(3).locator(".previous-number-one")).toBeChecked();
  await page.reload();
  await expect(page.locator("#teamTableBody tr").nth(3).locator(".previous-number-one")).toBeChecked();
  await page.locator("#clearProtectionOverrideBtn").click();
  await expect(page.locator("#teamTableBody tr").first().locator(".previous-number-one")).toBeChecked();
});

test("guide walkthrough and glossary are accessible", async ({ page }) => {
  await page.goto("/info.html");
  await expect(page.locator("#walkthroughHeading")).toBeVisible();
  await page.getByRole("button", { name: /glossary/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Balls");
  await page.getByRole("dialog").getByRole("button", { name: /close/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("rule versions show changes and restore the original settings", async ({ page }) => {
  await page.locator("#lotteryPickCount").fill("6");
  await page.locator("#lotteryPickCount").dispatchEvent("change");
  await expect(page.locator("#ruleHistoryList")).toContainText("8 → 6");
  await page.locator("#topThreeCooldownToggle").uncheck();
  await expect(page.locator("#ruleHistoryList")).toContainText(/On → Off/i);
  await page.locator("#ruleHistoryList .restore-rule-btn").last().click();
  await expect(page.locator("#lotteryPickCount")).toHaveValue("8");
  await expect(page.locator("#topThreeCooldownToggle")).toBeChecked();
  await page.reload();
  await expect(page.locator("#lotteryPickCount")).toHaveValue("8");
});

test("checksum mismatch warns but does not block valid history", async ({ page }) => {
  const payload = {
    _checksum: "0".repeat(64),
    lotteryHistory: {
      2023: {
        year: 2023, source: "manual", completeness: "top-three",
        finalOrder: ["A", "B", "C"].map((team, index) => ({ team, pick: index + 1 })),
      },
    },
  };
  await page.locator("#importHistoryInput").setInputFiles({
    name: "edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#historyYearSelect")).toHaveValue("2023");
  await expect(page.locator("#statusText")).toContainText(/checksum does not match/i);
});

test("tie-break indicators explain imported equal records", async ({ page }, testInfo) => {
  const payload = {
    teams: [
      { id: "a", name: "Arizona Cardinals", owner: "Arizona Cardinals", winPct: 0.25, sos: 0.4 },
      { id: "b", name: "Atlanta Falcons", owner: "Atlanta Falcons", winPct: 0.25, sos: 0.5 },
    ],
    settings: { topThreeCooldown: false, noConsecutiveNumberOne: false, bottomFourProtection: false },
  };
  await page.locator("#importJsonInput").setInputFiles({
    name: "ties.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator("#importJsonBtn").click();
  const container = testInfo.project.name === "mobile" ? "#mobileTeamList" : "#teamTableBody";
  await expect(page.locator(`${container} .tie-break-badge`)).toHaveCount(2);
  await expect(page.locator(`${container} .tie-break-badge`).first()).toContainText("Standings tie-break:");
  await expect(page.locator(`${container} .tie-break-badge`).first()).toHaveAttribute("title", /Strength of Schedule/);
  await expect(page.locator(`${container} .tie-break-badge`).first()).toHaveAttribute("title", /not the lottery draw/);
});

test("hidden archived history remains exportable and supplies protection", async ({ page }) => {
  await demo(page);
  await page.locator("#manualProtectionToggle").uncheck();
  await page.locator("#seasonYearInput").fill("2026");
  await page.locator("#seasonYearInput").dispatchEvent("change");
  const record = {
    year: 2025, source: "manual", completeness: "top-three", archived: true,
    finalOrder: ["Raiders", "Giants", "Titans"].map((team, index) => ({ team, pick: index + 1 })),
  };
  await page.locator("#importHistoryInput").setInputFiles({
    name: "archived.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ lotteryHistory: { 2025: record } })),
  });
  await page.locator("#importHistoryBtn").click();
  await expect(page.locator("#showArchivedToggle")).not.toBeChecked();
  await expect(page.locator("#historyYearSelect")).toHaveValue("");
  await expect(page.locator("#teamTableBody .previous-number-one:checked")).toHaveCount(1);
  await expect(page.locator("#teamTableBody .previous-top-three:checked")).toHaveCount(3);
  const backup = await download(page, "#exportHistoryBtn");
  expect(JSON.parse(backup.content).lotteryHistory["2025"].archived).toBe(true);
  await page.locator("#seasonYearInput").fill("2027");
  await page.locator("#seasonYearInput").dispatchEvent("change");
  await expect(page.locator("#flagSourceSummary")).toContainText("Year: 2026");
  await expect(page.locator("#flagSourceSummary")).not.toContainText("Year: 2025");
});

test("changing rules clears the previous required trades without replacing team cards", async ({ page }) => {
  const teams = ["Arizona Cardinals", "Atlanta Falcons"].map((name, index) => ({
    id: String(index), name, owner: name,
  }));
  const payload = {
    teams,
    results: [...teams].reverse().map((team, index) => ({
      ...team, team: team.name, standingIndex: Number(team.id), pick: index + 1,
    })),
    settings: { topThreeCooldown: false, noConsecutiveNumberOne: false, bottomFourProtection: false },
  };
  await page.locator("#importJsonInput").setInputFiles({
    name: "live.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator("#importJsonBtn").click();
  await expect(page.locator("#requiredTradesList")).toContainText("sends Pick");
  await page.locator("#lotteryPickCount").fill("6");
  await page.locator("#lotteryPickCount").dispatchEvent("change");
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(0);
  await expect(page.locator("#requiredTradesList")).not.toContainText("sends Pick");
});

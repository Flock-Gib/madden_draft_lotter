const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => {
    window.historyWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "flockvilleDraftLotteryHistory") window.historyWrites += 1;
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#seedEnabledToggle").check();
  await page.locator("#seedInput").fill("presentation-browser");
  await page.locator("#seedInput").press("Tab");
  await page.locator("#lotteryPickCount").fill("4");
  await page.locator("#lotteryPickCount").press("Tab");
});

for (const mode of ["normal", "fast", "skip", "reduced"]) {
  test(`${mode} reveals the same seeded order and saves exactly once`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    if (mode === "fast") await page.locator("#animationSpeed").selectOption("fast");
    const expected = await page.evaluate(() => {
      state.teams[0].owner = "Traded Owner";
      const results = runLotteryCalculation(createSeededRandom(state.seedText));
      return { results, trades: getRequiredTrades(results) };
    });
    // Two synchronous clicks exercise the guard even before the next paint.
    await page.locator("#startLotteryBtn").evaluate((button) => { button.click(); button.click(); });
    await expect(page.locator("#startLotteryBtn")).toBeDisabled();
    await expect(page.locator("#seasonYearInput")).toBeDisabled();
    await expect(page.locator("#skipAnimationBtn")).toBeEnabled();
    if (mode === "skip") {
      await page.locator("#skipAnimationBtn").click();
    } else if (mode === "normal") {
      await expect(page.locator("#resultsGrid .result-card")).toHaveCount(2, { timeout: 15_000 });
      await expect(page.locator("#resultsGrid .result-card").first()).toHaveCSS("animation-name", "none");
      await page.locator("#animationSpeed").selectOption("fast");
    }
    await expect(page.locator("#statusText")).toContainText("complete", { timeout: 45_000 });
    const saved = await page.evaluate(() => ({
      order: state.results,
      meta: state.lastRunMeta,
      record: state.lotteryHistory[String(state.lastRunMeta.year)],
      writes: window.historyWrites,
      active: activePresentation,
    }));
    expect(saved.order).toEqual(expected.results);
    expect(saved.record.trades).toEqual(expected.trades);
    expect(saved.meta.completed).toBe(true);
    expect(saved.writes).toBe(1);
    expect(saved.active).toBeNull();
    await expect(page.locator("#winnerPick")).toHaveText("Standings placement · Pick #8");
    await expect(page.locator("#startLotteryBtn")).toBeEnabled();
    await expect(page.locator("#seasonYearInput")).toBeEnabled();
    await expect(page.locator("#skipAnimationBtn")).toBeDisabled();
    await expect(page.locator("#stageProgress")).toHaveAttribute("value", "8");
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.locator("#resultsGrid .result-card")).toHaveCount(8);
  });
}

test("3D load failure falls back to 2D without changing the saved order", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  const expected = await page.evaluate(() => runLotteryCalculation(createSeededRandom(state.seedText)));
  await page.locator("#startLotteryBtn").click();
  await expect(page.locator("#machineText")).toContainText("Mixing", { timeout: 10_000 });
  await expect(page.locator(".machine-orb")).toBeVisible();
  await expect(page.locator(".lottery-3d")).toBeHidden();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  const saved = await page.evaluate(() => ({
    results: state.results,
    writes: window.historyWrites,
    active: activePresentation,
  }));
  expect(saved.results).toEqual(expected);
  expect(saved.writes).toBe(1);
  expect(saved.active).toBeNull();
});

test("3D initialization errors fall back to the existing presentation", async ({ page }) => {
  await page.evaluate(() => {
    globalThis.createLotteryStage3d = async () => {
      throw new Error("WebGL initialization failed");
    };
  });
  await page.locator("#startLotteryBtn").click();
  await expect(page.locator("#machineText")).toContainText("Mixing", { timeout: 10_000 });
  await expect(page.locator(".machine-orb")).toBeVisible();
  await expect(page.locator(".lottery-3d")).toBeHidden();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  await expect(page.locator("#startLotteryBtn")).toBeEnabled();
});

test("3D presentation reveals the precomputed seeded results in order and disposes once", async ({ page }) => {
  await page.evaluate(() => {
    window.stageReveals = [];
    window.stageDisposals = 0;
    globalThis.createLotteryStage3d = async (container) => {
      container.hidden = false;
      return {
        setPhase() {},
        reveal(result) { window.stageReveals.push({ pick: result.pick, team: result.team }); },
        setReducedMotion() {},
        dispose() { window.stageDisposals += 1; },
      };
    };
  });
  const expected = await page.evaluate(() => runLotteryCalculation(createSeededRandom(state.seedText)));
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  const saved = await page.evaluate(() => ({
    results: state.results,
    reveals: window.stageReveals,
    disposals: window.stageDisposals,
    writes: window.historyWrites,
  }));
  expect(saved.results).toEqual(expected);
  expect(saved.reveals).toEqual(expected.map(({ pick, team }) => ({ pick, team })));
  expect(saved.disposals).toBe(1);
  expect(saved.writes).toBe(1);
});

test("interrupted 3D presentation disposes its stage and unlocks the app", async ({ page }) => {
  await page.evaluate(() => {
    window.stageDisposals = 0;
    globalThis.createLotteryStage3d = async (container) => {
      container.hidden = false;
      return {
        setPhase() {},
        reveal() {},
        setReducedMotion() {},
        dispose() { window.stageDisposals += 1; },
      };
    };
  });
  await page.locator("#startLotteryBtn").click();
  await page.waitForFunction(() => activeLotteryStage3d !== null);
  await page.evaluate(() => stopLotteryPresentation());
  await expect(page.locator("#startLotteryBtn")).toBeEnabled();
  await expect(page.locator(".lottery-3d")).toBeHidden();
  const cleanup = await page.evaluate(() => ({
    disposals: window.stageDisposals,
    results: state.results,
    active: activePresentation,
    running: state.isRunning,
    writes: window.historyWrites,
  }));
  expect(cleanup).toEqual({
    disposals: 1,
    results: [],
    active: null,
    running: false,
    writes: 0,
  });
});

test("rerun and interrupted reload preserve the completed historical record", async ({ page }) => {
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  const history = await page.evaluate(() => localStorage.getItem("flockvilleDraftLotteryHistory"));
  await page.locator("#startLotteryBtn").click();
  await expect(page.locator("#startLotteryBtn")).toBeDisabled();
  expect(await page.evaluate(() => state.lastRunMeta.completed)).toBe(false);
  await page.reload();
  await expect(page.locator("#resultsGrid .result-card")).toHaveCount(0);
  await expect(page.locator("#startLotteryBtn")).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("flockvilleDraftLotteryHistory"))).toBe(history);
  await page.locator("#startLotteryBtn").click();
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete");
  expect(await page.evaluate(() => window.historyWrites)).toBe(1);
});

for (const width of [1440, 768, 375]) {
  test(`live and revealed stage preview at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Fixed viewport coverage runs once.");
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("#startLotteryBtn").click();
    await page.locator("#draw").scrollIntoViewIfNeeded();
    await expect(page.locator(".machine-orb")).toHaveAttribute("data-phase", "mixing");
    await page.screenshot({ path: testInfo.outputPath(`live-${width}.png`) });
    await testInfo.attach(`Live stage ${width}px`, {
      path: testInfo.outputPath(`live-${width}.png`), contentType: "image/png",
    });
    await page.locator("#skipAnimationBtn").click();
    await expect(page.locator("#statusText")).toContainText("complete");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`revealed-${width}.png`) });
    await testInfo.attach(`Revealed stage ${width}px`, {
      path: testInfo.outputPath(`revealed-${width}.png`), contentType: "image/png",
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".lottery-balls i").first()).toHaveCSS("animation-name", "none");
  });
}

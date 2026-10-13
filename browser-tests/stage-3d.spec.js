const path = require("node:path");
const { test, expect } = require("@playwright/test");

// Real WebGL coverage. The CDN is routed to the identical pinned local copy of
// three@0.160.0 (same bytes, so the page's SRI check still applies). Headless
// CI has no GPU, so Chromium renders through SwiftShader (software WebGL).
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
const THREE_FILE = path.join(__dirname, "..", "node_modules", "three", "build", "three.min.js");
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Software WebGL scene coverage runs once.");
  test.setTimeout(120_000);
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => {
    window.historyWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "flockvilleDraftLotteryHistory") window.historyWrites += 1;
      return setItem.call(this, key, value);
    };
  });
  await page.route(THREE_URL, (route) => route.fulfill({
    path: THREE_FILE,
    contentType: "application/javascript",
    headers: { "access-control-allow-origin": "*" },
  }));
  await page.goto("/");
  const webgl = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
  test.skip(!webgl, "WebGL2 is unavailable in this browser environment.");
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#seedEnabledToggle").check();
  await page.locator("#seedInput").fill("real-scene");
  await page.locator("#seedInput").press("Tab");
  await page.locator("#lotteryPickCount").fill("2");
  await page.locator("#lotteryPickCount").press("Tab");
  await page.locator("#animationSpeed").selectOption("fast");
});

async function expectedResults(page) {
  return page.evaluate(() => runLotteryCalculation(createSeededRandom(state.seedText)));
}

async function waitForStage(page) {
  await page.waitForFunction(() => activeLotteryStage3d?.debug?.rendering === true, null, { timeout: 30_000 });
  await expect(page.locator(".lottery-stage")).toHaveClass(/has-3d/);
  await expect(page.locator(".lottery-3d")).toBeVisible();
}

async function expectSavedOnce(page, expected) {
  await expect(page.locator("#statusText")).toContainText("complete", { timeout: 90_000 });
  const saved = await page.evaluate(() => ({
    results: state.results,
    writes: window.historyWrites,
    active: activePresentation,
    stage: activeLotteryStage3d,
  }));
  expect(saved.results).toEqual(expected);
  expect(saved.writes).toBe(1);
  expect(saved.active).toBeNull();
  expect(saved.stage).toBeNull();
  await expect(page.locator("#startLotteryBtn")).toBeEnabled();
}

// Decodes a canvas screenshot in the page and reports brightness statistics.
async function canvasStats(page) {
  const png = await page.locator(".lottery-3d canvas").screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let dark = 0;
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      if (luma < 35) dark += 1;
      total += 1;
    }
    return { darkFraction: dark / total, width: image.width, height: image.height };
  }, png.toString("base64"));
}

test("real WebGL scene renders bright, separated, framed balls and saves the seeded order once", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const expected = await expectedResults(page);
  await page.evaluate(() => {
    // Hold the first mixing phase so the scene can be inspected deterministically.
    const original = window.presentationPause;
    window.holdFirstPause = new Promise((release) => { window.releaseFirstPause = release; });
    let first = true;
    window.presentationPause = async (...args) => {
      if (first) {
        first = false;
        await window.holdFirstPause;
      }
      return original(...args);
    };
  });
  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  await page.waitForTimeout(800);
  const scene = await page.evaluate(() => {
    const debug = activeLotteryStage3d.debug;
    return {
      ballCount: debug.ballCount,
      radius: debug.ballRadius,
      positions: debug.positions(),
      projected: debug.positions().map(([x, y, z]) => debug.project(x, y, z)),
      teams: new Set(state.teams.map((team) => team.name)).size,
      error: createLotteryStage3d.lastError ?? null,
    };
  });
  expect(scene.error).toBeNull();
  expect(scene.ballCount).toBe(scene.teams);
  for (let i = 0; i < scene.positions.length; i += 1) {
    for (let j = i + 1; j < scene.positions.length; j += 1) {
      const [a, b] = [scene.positions[i], scene.positions[j]];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(scene.radius * 1.7);
    }
  }
  for (const [x, y] of scene.projected) {
    expect(Math.abs(x)).toBeLessThan(1);
    expect(Math.abs(y)).toBeLessThan(1);
  }
  const stats = await canvasStats(page);
  // Regression for the black-ball/black-globe rendering in the first 3D version.
  expect(stats.darkFraction).toBeLessThan(0.03);

  await page.evaluate(() => window.releaseFirstPause());
  await page.waitForFunction(() => activeLotteryStage3d?.debug?.heroTeam, null, { timeout: 30_000 });
  const hero = await page.evaluate(() => ({
    team: activeLotteryStage3d.debug.heroTeam,
    first: state.results[0]?.team ?? null,
  }));
  expect(expected.map((result) => result.team)).toContain(hero.team);
  await expectSavedOnce(page, expected);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => createLotteryStage3d.lastError ?? null)).toBeNull();
});

test("skip with the real scene keeps the same order, disposes the renderer, and reruns in 3D", async ({ page }) => {
  const expected = await expectedResults(page);
  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  await page.evaluate(() => { window.firstStage = activeLotteryStage3d; });
  await page.locator("#skipAnimationBtn").click();
  await expectSavedOnce(page, expected);
  expect(await page.evaluate(() => window.firstStage.debug.rendering)).toBe(false);
  await expect(page.locator(".lottery-3d")).toBeHidden();

  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  expect(await page.evaluate(() => activeLotteryStage3d !== window.firstStage)).toBe(true);
  await page.locator("#skipAnimationBtn").click();
  await expect(page.locator("#statusText")).toContainText("complete", { timeout: 90_000 });
  expect(await page.evaluate(() => ({ results: state.results, writes: window.historyWrites }))).toEqual({
    results: expected,
    writes: 2,
  });
});

test("WebGL context loss mid-run falls back to 2D, stops rendering, and still saves once", async ({ page }) => {
  const expected = await expectedResults(page);
  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  await page.evaluate(() => {
    window.lostStage = activeLotteryStage3d;
    const canvas = document.querySelector(".lottery-3d canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    context.getExtension("WEBGL_lose_context").loseContext();
  });
  await expect(page.locator(".lottery-3d")).toBeHidden();
  await expect(page.locator(".lottery-stage")).not.toHaveClass(/has-3d/);
  await expect(page.locator(".machine-orb")).toBeVisible();
  expect(await page.evaluate(() => window.lostStage.debug.rendering)).toBe(false);
  await expectSavedOnce(page, expected);
});

test("reduced motion with the real scene reveals statically and saves the same order once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const expected = await expectedResults(page);
  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  const first = await page.evaluate(() => activeLotteryStage3d.debug.positions());
  await page.waitForTimeout(500);
  const later = await page.evaluate(() => activeLotteryStage3d?.debug.positions() ?? null);
  // Drawn balls leave the pool; every ball still in the chamber must be static.
  const key = (position) => position.map((value) => value.toFixed(6)).join(",");
  if (later) for (const position of later) expect(first.map(key)).toContain(key(position));
  await expectSavedOnce(page, expected);
});

test("missing user-provided logos fall back to monograms without stalling the reveal", async ({ page }) => {
  const teams = await page.evaluate(() => state.teams.map((team) => team.name));
  const logos = Object.fromEntries(teams.map((name, index) => [name, index % 2 ? "assets/team-logos/missing.png" : "assets/team-logos/ok.png"]));
  await page.route("**/assets/team-logos/manifest.json", (route) => route.fulfill({ json: { logos } }));
  await page.route("**/assets/team-logos/missing.png", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/assets/team-logos/ok.png", (route) => route.fulfill({ body: PNG_1X1, contentType: "image/png" }));
  const expected = await expectedResults(page);
  await page.locator("#startLotteryBtn").click();
  await waitForStage(page);
  await expectSavedOnce(page, expected);
  expect(await page.evaluate(() => createLotteryStage3d.lastError ?? null)).toBeNull();
  const badge = page.locator("#winnerBadge");
  await expect(badge).toBeVisible();
  const lastTeamIndex = teams.indexOf(expected.at(-1).team);
  if (lastTeamIndex % 2) {
    await expect(badge.locator(".team-badge-text")).toHaveText(/\S+/);
    await expect(badge.locator("img")).toHaveCount(0);
  } else {
    await expect(badge.locator("img")).toHaveAttribute("src", "assets/team-logos/ok.png");
  }
});

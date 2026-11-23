const { test, expect } = require("@playwright/test");

test("ability chart searches all records, sorts, filters, and pages without losing entries", async ({ page }) => {
  await page.goto("/?page=ability");
  const rows = page.locator("#abilityTableBody tr");
  await expect(page.locator(".ability-count-badge")).toContainText("360 chart entries");
  await expect(rows).toHaveCount(25);
  await expect(page.locator("#abilityCount")).toContainText("1–25 of 360 matches");
  await expect(page.locator("#abilityPreviousPage")).toBeDisabled();
  await page.locator("#abilityNextPage").click();
  await expect(page.locator("#abilityCount")).toContainText("26–50 of 360 matches");
  await expect(page.locator(".ability-browse-bar")).toBeFocused();
  await page.locator("#abilityPage").selectOption("15");
  await expect(rows).toHaveCount(10);
  await expect(page.locator("#abilityCount")).toContainText("351–360 of 360 matches");
  await expect(page.locator("#abilityNextPage")).toBeDisabled();

  const expectedPositions = ["QB", "HB", "FB", "WR", "TE", "OL", "EDGE", "DT", "MIKE", "OLB", "CB", "S", "K-P"];
  const groups = await page.locator("#abilityPosition optgroup").evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.label, positions: [...node.children].map((option) => option.value) })));
  expect(groups.map((group) => group.label)).toEqual(["Offense", "Defense", "Special teams"]);
  expect(groups.flatMap((group) => group.positions)).toEqual(expectedPositions);
  await page.locator('#abilityPositionNav button[data-position="QB"]').click();
  await expect(page.locator("#abilityPosition")).toHaveValue("QB");
  await expect(page.locator("#abilityPage")).toHaveValue("1");
  await expect(page.locator('#abilityPositionNav button[aria-pressed="true"]')).toHaveText("QB");
  expect(new Set(await rows.locator("td:first-child").allTextContents())).toEqual(new Set(["QB"]));
  await page.locator("#abilityType").selectOption("X-Factor");
  expect(new Set(await rows.locator("td:nth-child(2)").allTextContents())).toEqual(new Set(["X-Factor"]));
  await page.locator("#clearAbilityFilters").click();
  await expect(page.locator('#abilityPositionNav button[aria-pressed="true"]')).toHaveText("All positions");

  await page.locator("#abilitySort").selectOption("ability");
  const firstAscending = await rows.first().locator("td:nth-child(3)").textContent();
  await page.locator("#abilitySortDirection").click();
  expect(await rows.first().locator("td:nth-child(3)").textContent()).not.toBe(firstAscending);
  await expect(page.locator('th[data-sort="ability"]')).toHaveAttribute("aria-sort", "descending");
  await page.getByLabel("Search abilities").fill("Bazooka");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bazooka");
  await expect(page.locator("#abilityNextPage")).toBeDisabled();
  await rows.first().locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(rows.first().locator("dd").first()).toHaveText("N/A — X-Factors do not tier");
  await expect(rows.first().locator("dd").last()).toHaveText("Verified");
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Lottery", exact: true }).click();
  await expect(page.locator("#setup")).toBeVisible();
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("link", { name: "Ability Guide" }).click();
  await expect(page.locator("#abilityGuideHeading")).toBeFocused();
  await expect(page.getByLabel("Search abilities")).toHaveValue("Bazooka");
  await expect(rows).toHaveCount(1);

  await page.getByLabel("Search abilities").fill("not-an-ability-123");
  await expect(page.locator("#abilityCount")).toContainText("No matches");
  await expect(rows).toContainText("clear the filters");
  await expect(page.locator("#abilityPage")).toBeDisabled();
  await page.locator("#clearAbilityFilters").click();
  await expect(rows).toHaveCount(25);
});

for (const width of [360, 768, 1280, 1920]) {
  test(`chart and navigation use the available width without clipped content at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Run fixed widths once.");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?page=ability");
    await expect(page.locator("#abilityTableBody tr")).toHaveCount(25);
    // Expand the longest requirements, not only the short default X-Factor rows.
    await page.locator("#abilitySort").selectOption("goldRequirements");
    await page.locator("#abilitySortDirection").click();
    await page.locator("#abilityTableBody summary").first().click();
    const layout = await page.evaluate(() => {
      const wrapper = document.querySelector(".ability-table-wrap");
      const shell = document.querySelector(".app-shell").getBoundingClientRect();
      const nav = document.querySelector(".site-nav").getBoundingClientRect();
      const overflow = [...document.querySelectorAll(".ability-guide td, .ability-guide input, .ability-guide select, .ability-guide button")]
        .filter((element) => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent);
      return {
        pageWidth: document.documentElement.scrollWidth,
        shellWidth: shell.width,
        chartWidth: wrapper.clientWidth,
        chartScrollWidth: wrapper.scrollWidth,
        linksVisible: [...document.querySelectorAll(".site-nav a")].every((link) => {
          const box = link.getBoundingClientRect();
          return box.left >= nav.left && box.right <= nav.right + 1;
        }),
        overflow,
      };
    });
    expect(layout.pageWidth).toBe(width);
    expect(layout.shellWidth).toBeGreaterThanOrEqual(width - 48);
    expect(layout.chartScrollWidth).toBeLessThanOrEqual(layout.chartWidth + 1);
    expect(layout.linksVisible).toBe(true);
    expect(layout.overflow).toEqual([]);
    if (width <= 680) {
      await page.goto("/?page=ability");
      const search = await page.locator("#abilitySearch").boundingBox();
      expect(search.y + search.height).toBeLessThan(1000);
    }
    if (width >= 1200) {
      await page.locator('th[data-sort="ability"] button').click();
      await expect(page.locator("#abilitySort")).toHaveValue("ability");
    } else {
      await expect(page.locator("#abilityTableBody tr").first()).toHaveCSS("display", "grid");
    }
    await page.screenshot({ path: testInfo.outputPath(`ability-${width}.png`), fullPage: true, animations: "disabled" });
  });
}

test("supplied logo can be paused and respects reduced motion on both pages", async ({ page }) => {
  for (const path of ["/?page=ability", "/info.html"]) {
    await page.goto(path);
    const logo = page.locator(".brand-mark img");
    await expect(logo).toHaveJSProperty("complete", true);
    await expect(logo).toHaveJSProperty("naturalWidth", 508);
    await expect(logo).toHaveAttribute("src", "assets/flockville-energy-logo.gif");
    await page.getByRole("button", { name: "Pause logo animation" }).click();
    await expect(logo).toHaveAttribute("src", "assets/flockville-energy-logo.png");
    await page.getByRole("button", { name: "Play logo animation" }).click();
    await expect(logo).toHaveAttribute("src", "assets/flockville-energy-logo.gif");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(logo).toHaveJSProperty("currentSrc", new URL("assets/flockville-energy-logo.png", page.url()).href);
    await expect(page.locator(".logo-motion-toggle")).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});

const { test, expect } = require("@playwright/test");

test("ability chart loads, sorts, searches, filters, and stays contained on desktop and mobile", async ({ page }) => {
  await page.goto("/?page=ability");
  const rows = page.locator("#abilityTableBody tr");
  await expect(page.locator(".ability-count-badge")).toContainText("360 chart entries");
  await expect(rows).toHaveCount(360);

  const expectedPositions = ["QB", "HB", "FB", "WR", "TE", "OL", "EDGE", "DT", "MIKE", "OLB", "CB", "S", "K-P"];
  const groups = await page.locator("#abilityPosition optgroup").evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.label, positions: [...node.children].map((option) => option.value) })));
  expect(groups.map((group) => group.label)).toEqual(["Offense", "Defense", "Special teams"]);
  expect(groups.flatMap((group) => group.positions)).toEqual(expectedPositions);
  const positions = () => page.locator("#abilityTableBody tr td:first-child").allTextContents();
  expect([...new Set(await positions())]).toEqual(expectedPositions);
  await page.locator('th[data-sort="position"] button').click();
  expect([...new Set(await positions())]).toEqual([...expectedPositions].reverse());

  await page.locator('th[data-sort="ability"] button').click();
  const abilityCells = page.locator("#abilityTableBody tr td:nth-child(3)");
  const firstAscending = await abilityCells.first().textContent();
  await page.locator('th[data-sort="ability"] button').click();
  const firstDescending = await abilityCells.first().textContent();
  expect(firstDescending).not.toBe(firstAscending);

  await page.getByLabel("Search abilities").fill("Bazooka");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bazooka");
  await page.getByLabel("Search abilities").clear();

  await page.locator("#abilityPosition").selectOption("QB");
  await page.locator("#abilityType").selectOption("X-Factor");
  await expect(page.locator("#abilityCount")).toContainText("of 360 chart entries");
  const filteredPositions = await page.locator("#abilityTableBody tr td:first-child").allTextContents();
  expect(filteredPositions.length).toBeGreaterThan(0);
  expect(new Set(filteredPositions)).toEqual(new Set(["QB"]));

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const layout = await page.evaluate(() => {
    const wrapper = document.querySelector(".ability-table-wrap");
    return {
      pageWidth: document.documentElement.scrollWidth,
      wrapperWidth: wrapper.clientWidth,
      tableWidth: wrapper.scrollWidth,
    };
  });
  expect(layout.pageWidth).toBe(viewportWidth);
  expect(layout.wrapperWidth).toBeLessThanOrEqual(viewportWidth);
  expect(layout.tableWidth).toBeGreaterThan(layout.wrapperWidth);

  const style = await page.evaluate(() => ({
    background: getComputedStyle(document.querySelector(".ability-guide")).backgroundColor,
    text: getComputedStyle(document.querySelector(".ability-guide")).color,
    positionWidth: document.querySelector('.ability-table th[data-sort="position"]').getBoundingClientRect().width,
    typeWrap: getComputedStyle(document.querySelector(".ability-table td:nth-child(2)")).overflowWrap,
  }));
  expect(style.background).toBe("rgb(24, 20, 33)");
  expect(style.text).toBe("rgb(244, 239, 255)");
  expect(style.positionWidth).toBeGreaterThanOrEqual(100);
  expect(style.typeWrap).toBe("normal");
});

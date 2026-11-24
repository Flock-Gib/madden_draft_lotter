const { test, expect } = require("@playwright/test");
const history = require("../flockville-draft-lottery/lottery-history.js");

function manual(year, names, archived = false) {
  const record = history.createManualRecord({
    year, completeness: "top-three",
    finalOrder: names.map(([team, owner, cpuLocked], index) => ({
      pick: index + 1, team, owner, cpuLocked,
    })),
  });
  return { ...record, archived };
}

async function mockHistory(page, records) {
  await page.route("https://ybortnssqkjvrzggmfeb.supabase.co/**", async (route) => {
    const body = Object.entries(records).map(([year, record]) => ({ season_year: Number(year), record }));
    await route.fulfill({ status: 200, json: body });
  });
}

test("public search and comparison distinguish original team from owner and include archived seasons", async ({ page }) => {
  await mockHistory(page, {
    2026: manual(2026, [["Bears", "Falcons"], ["Lions", "Lions"], ["Ravens", "Ravens"]]),
    2025: manual(2025, [["Bears", "Lions", true], ["Jets", "Jets"], ["Giants", "Giants"]], true),
  });
  await page.goto("/?page=history");
  await expect(page.locator("#historySearchSummary")).toContainText("2 saved seasons");
  await expect(page.locator("#historySearchSummary")).toContainText("2025 (archived)");
  await expect(page.locator("#historySearchResults tr")).toHaveCount(0);
  await page.locator("#historyTeamSearch").fill("bEaR");
  await expect(page.locator("#historySearchSummary")).toContainText("2 matches");
  const rows = page.locator("#historySearchResults tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Falcons");
  await expect(rows.nth(1)).toContainText("2025 (archived)");
  await expect(rows.nth(1)).toContainText("CPU / locked");
  await expect(rows.nth(1)).toContainText("Unknown");
  await page.locator("#historyTeamSearch").fill("Falcons");
  await expect(page.locator("#historySearchSummary")).toContainText("0 matches");
  await page.locator("#historyTeamSearch").fill("Bears");
  await page.locator("#historyFromYear").fill("2026");
  await expect(page.locator("#historySearchSummary")).toContainText("1 match");
  await page.locator("#historyToYear").fill("2025");
  await expect(page.locator("#historySearchSummary")).toContainText("From year");
  await page.locator("#historyToYear").fill("");
  await page.locator("#historyCompareYear").selectOption("2025");
  const comparison = page.locator("#historyComparison");
  await expect(comparison).toContainText("2025 (archived)");
  await expect(comparison.locator("tbody tr").filter({ hasText: "Bears" })).toContainText("Falcons");
  await expect(comparison.locator("tbody tr").filter({ hasText: "Bears" })).toContainText("Lions");
  await expect(comparison.locator("tbody tr").filter({ hasText: "Jets" })).toContainText("Not in saved results");
  await expect(comparison.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: "Lions", exact: true }) })).toContainText("Not in saved results");
});

test("empty archive shows honest no-data states", async ({ page }) => {
  await mockHistory(page, {});
  await page.goto("/?page=history");
  await expect(page.locator("#historySearchSummary")).toContainText("No saved seasons");
  await expect(page.locator("#historyComparison")).toContainText("No saved seasons");
});

test("search paginates while counting every matching season", async ({ page }) => {
  const records = {};
  for (let year = 2000; year <= 2050; year++) {
    records[year] = manual(year, [["Bears", "Bears"], ["Jets", "Jets"], ["Lions", "Lions"]]);
  }
  await mockHistory(page, records);
  await page.goto("/?page=history");
  await expect(page.locator("#historySearchSummary")).toContainText("51 saved seasons");
  await page.locator("#historyTeamSearch").fill("Bears");
  await expect(page.locator("#historySearchSummary")).toContainText("51 matches; showing 50");
  await expect(page.locator("#historySearchResults tbody tr")).toHaveCount(50);
  await page.locator("#historyMoreBtn").click();
  await expect(page.locator("#historySearchResults tbody tr")).toHaveCount(51);
  await expect(page.locator("#historyMoreBtn")).toHaveCount(0);
});

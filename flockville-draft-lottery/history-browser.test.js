const test = require("node:test");
const assert = require("node:assert/strict");
const browser = require("./history-browser.js");

const history = {
  2025: {
    source: "manual", archived: true,
    finalOrder: [
      { team: "Bears", owner: "Lions", pick: 1, originalSlot: null, movement: 0 },
      { team: "Jets", owner: "Jets", pick: 2, originalSlot: 4, cpuLocked: true },
    ],
  },
  2026: {
    finalOrder: [
      { team: "BEARS", owner: "Falcons", pick: 2, originalSlot: 1 },
      { team: "Lions", owner: "Lions", pick: 1, originalSlot: 3 },
    ],
  },
};

test("search matches original teams, not owners, and includes archived years", () => {
  const bears = browser.searchHistory(history, "eAr").rows;
  assert.deepEqual(bears.map((row) => [row.year, row.team, row.owner]), [
    ["2026", "BEARS", "Falcons"], ["2025", "Bears", "Lions"],
  ]);
  assert.equal(bears[1].archived, true);
  assert.deepEqual(browser.searchHistory(history, "Falcons").rows, []);
  assert.deepEqual(browser.searchHistory(history, "  ").rows, []);
});

test("search enforces inclusive valid year ranges", () => {
  assert.deepEqual(browser.searchHistory(history, "bears", "2025", "2025").rows.map((row) => row.year), ["2025"]);
  for (const [from, to] of [["999", ""], ["", "10000"], ["2026", "2025"], ["2025.5", ""]]) {
    assert.ok(browser.searchHistory(history, "bears", from, to).error);
  }
});

test("projection reports movement from known slots and CPU status without inventing manual metadata", () => {
  const manual = browser.projectSeason(history[2025], 2025);
  assert.equal(manual[0].movement, null);
  assert.equal(manual[0].cpu, "Unknown");
  assert.equal(manual[1].movement, 2);
  assert.equal(manual[1].cpu, "CPU / locked");
  const automatic = browser.projectSeason(history[2026], 2026);
  assert.equal(automatic[0].movement, -1);
  assert.equal(automatic[0].cpu, "Not CPU-locked");
});

test("comparison joins case-insensitive original teams and includes missing teams", () => {
  const rows = browser.compareSeasons(history, "2025", "2026");
  assert.deepEqual(rows.map((row) => row.team), ["Bears", "Jets", "Lions"]);
  assert.equal(rows[0].first.owner, "Lions");
  assert.equal(rows[0].second.owner, "Falcons");
  assert.equal(rows[0].first.movement, null);
  assert.equal(rows[1].second, null);
  assert.equal(rows[2].first, null);
});

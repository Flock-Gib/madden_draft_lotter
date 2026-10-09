const test = require("node:test");
const assert = require("node:assert/strict");
const history = require("./lottery-history.js");

const record = (year, extra = {}) => ({
  year,
  runAt: "2026-01-01T00:00:00.000Z",
  finalOrder: [
    { pick: 1, team: "B", owner: "B", originalSlot: 2 },
    { pick: 2, team: "A", owner: "A", originalSlot: 1 },
  ],
  odds: [{ slot: 1, team: "A", balls: 3, percent: 60 }],
  trades: [{ fromTeam: "B", toTeam: "A", sendPick: 2, receivePick: 1 }],
  ...extra,
});

test("upsert keys records by year without touching other years", () => {
  let h = history.upsertRecord({}, record(2025));
  h = history.upsertRecord(h, record(2026));
  assert.deepEqual(history.getSortedYears(h), [2026, 2025]);
  assert.equal(h["2026"].finalOrder[0].movement, 1);
  assert.equal(h["2026"].trades[0].summary, "B sends Pick #2 to A for Pick #1");
});

test("removeYear deletes only the selected year", () => {
  const h = history.sanitizeHistory({ 2025: record(2025), 2026: record(2026) });
  assert.deepEqual(Object.keys(history.removeYear(h, 2025)), ["2026"]);
});

test("sanitizeHistory drops invalid years and empty records", () => {
  const h = history.sanitizeHistory({
    abc: record("abc"),
    2024: { year: 2024, finalOrder: [] },
    2023: record(2023),
    __proto__: record(2022),
  });
  assert.deepEqual(Object.keys(h), ["2023"]);
});

test("mergeHistory reports conflicts and can keep existing years", () => {
  const existing = history.sanitizeHistory([record(2025, { seed: "old" })]);
  const incoming = history.sanitizeHistory([record(2025, { seed: "new" }), record(2026)]);
  const keep = history.mergeHistory(existing, incoming, { replaceConflicts: false });
  assert.deepEqual(keep.conflicts, [2025]);
  assert.deepEqual(keep.added, [2026]);
  assert.equal(keep.merged["2025"].seed, "old");
  const replace = history.mergeHistory(existing, incoming);
  assert.equal(replace.merged["2025"].seed, "new");
});

test("export round-trips through extractHistoryFromPayload", () => {
  const h = history.sanitizeHistory([record(2026)]);
  const exported = JSON.parse(JSON.stringify(history.buildHistoryExport(h)));
  assert.equal(exported.type, history.HISTORY_EXPORT_TYPE);
  assert.deepEqual(history.extractHistoryFromPayload(exported), h);
});

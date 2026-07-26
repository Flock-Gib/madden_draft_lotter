const test = require("node:test");
const assert = require("node:assert/strict");
const { compareLotteryEntries, orderLotteryEntries } = require("./lottery-order.js");

test("orders by worse record first (lower winPct)", () => {
  const a = { id: "A", winPct: 0.25, sos: 0.55, standingIndex: 0 };
  const b = { id: "B", winPct: 0.3, sos: 0.45, standingIndex: 1 };
  assert.ok(compareLotteryEntries(a, b, {}) < 0);
  assert.equal(orderLotteryEntries([b, a])[0].id, "A");
});

test("uses SoS when records tie", () => {
  const a = { id: "A", winPct: 0.3, sos: 0.45, standingIndex: 0 };
  const b = { id: "B", winPct: 0.3, sos: 0.5, standingIndex: 1 };
  assert.ok(compareLotteryEntries(a, b, {}) < 0);
});

test("uses head-to-head when record and SoS tie", () => {
  const a = { id: "A", winPct: 0.3, sos: 0.45, standingIndex: 0 };
  const b = { id: "B", winPct: 0.3, sos: 0.45, standingIndex: 1 };
  const context = { headToHead: { "A|B": { aWins: 0, bWins: 2 } } };
  assert.ok(compareLotteryEntries(a, b, context) < 0);
});

test("deterministic coin flip is stable for same seed", () => {
  const a = { id: "A", winPct: 0.3, sos: 0.45, standingIndex: 0 };
  const b = { id: "B", winPct: 0.3, sos: 0.45, standingIndex: 1 };
  const result1 = compareLotteryEntries(a, b, { seed: "league-2026" });
  const result2 = compareLotteryEntries(a, b, { seed: "league-2026" });
  assert.equal(result1, result2);
  assert.ok(result1 === -1 || result1 === 1);
});

test("regression: existing flow keeps standing order when optional tie-break data is absent", () => {
  const teams = [
    { id: "A", standingIndex: 0 },
    { id: "B", standingIndex: 1 },
    { id: "C", standingIndex: 2 },
  ];
  const ordered = orderLotteryEntries(teams);
  assert.deepEqual(ordered.map((team) => team.id), ["A", "B", "C"]);
});

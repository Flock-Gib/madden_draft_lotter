const test = require("node:test");
const assert = require("node:assert/strict");
const { compareLotteryEntries, orderLotteryEntries, describeTieBreaks } = require("./lottery-order.js");

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

test("tie explanations exclude unequal records, untied standings and unknown fallback records", () => {
  for (const entries of [
    [{ id: "A", winPct: 0.2 }, { id: "B", winPct: 0.3 }],
    [{ id: "A", standingIndex: 0 }, { id: "B", standingIndex: 1 }],
    [{ id: "A" }, { id: "B" }],
    [{ id: "A", winPct: 0 }, { id: "B" }],
    [{ id: "A", winPct: 0 }, { id: "B", standingIndex: 0 }],
  ]) assert.deepEqual(describeTieBreaks(entries), []);
  assert.deepEqual(describeTieBreaks(null), []);
});

test("tie explanations mirror SoS precedence without changing sorting", () => {
  const entries = [{ id: "A", name: "Bears", winPct: 0.3, sos: 0.4 },
    { id: "B", name: "Jets", winPct: "0.3", sos: "0.5" }];
  const context = { headToHead: { "A|B": { aWins: 2, bWins: 0 } } };
  const before = orderLotteryEntries(entries, context);
  assert.deepEqual(describeTieBreaks(entries, context), [
    { id: "A", name: "Bears", reason: "Strength of Schedule", opponents: ["Jets"] },
    { id: "B", name: "Jets", reason: "Strength of Schedule", opponents: ["Bears"] },
  ]);
  assert.deepEqual(orderLotteryEntries(entries, context), before);
  assert.equal(before[0].id, "A");
});

test("tie explanations support context and direct head-to-head and missing SoS", () => {
  const a = { id: "A", name: "Bears", winPct: 0.3 };
  const b = { id: "B", name: "Jets", winPct: 0.3 };
  const explanation = describeTieBreaks([a, b], { headToHead: { "A|B": { aWins: 0, bWins: 2 } } });
  assert.deepEqual(explanation.map(({ reason }) => reason), ["Head-to-head", "Head-to-head"]);
  const direct = [{ ...a, headToHead: { B: -1 } }, { ...b, headToHead: { A: 1 } }];
  assert.deepEqual(describeTieBreaks(direct).map(({ reason }) => reason), ["Head-to-head", "Head-to-head"]);
  const tied = describeTieBreaks([a, b], { headToHead: { "A|B": { aWins: 1, bWins: 1 } } });
  assert.deepEqual(tied.map(({ reason }) => reason), ["Coin flip", "Coin flip"]);
});

test("multi-team ties group opponents by the actual deciding rule", () => {
  const entries = [
    { id: "A", name: "Bears", winPct: 0.3, sos: 0.4 },
    { id: "B", name: "Jets", winPct: 0.3, sos: 0.5 },
    { id: "C", name: "Bills", winPct: 0.3, sos: 0.4 },
    { id: "D", name: "Lions", winPct: 0.3, sos: 0.4 },
    { id: "E", name: "Ravens", winPct: 0.5, sos: 0.4 },
  ];
  const snapshot = JSON.stringify(entries);
  const explanation = describeTieBreaks(entries, { seed: "fixed" });
  assert.deepEqual(explanation.filter(({ id }) => id === "A"), [
    { id: "A", name: "Bears", reason: "Strength of Schedule", opponents: ["Jets"] },
    { id: "A", name: "Bears", reason: "Coin flip", opponents: ["Bills", "Lions"] },
  ]);
  assert.equal(explanation.some(({ id }) => id === "E"), false);
  assert.equal(JSON.stringify(entries), snapshot);
});

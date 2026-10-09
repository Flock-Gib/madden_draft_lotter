const test = require("node:test");
const assert = require("node:assert/strict");
const { computeRequiredTrades } = require("./lottery-trades.js");

function applyTrades(results, trades) {
  const holder = new Map(results.map((r) => [r.originalSlot, r.owner]));
  trades.forEach((trade) => {
    assert.equal(holder.get(trade.sendPick), trade.fromTeam, "sender must currently own the pick it sends");
    assert.equal(holder.get(trade.receivePick), trade.toTeam, "receiver must currently own the pick it sends back");
    holder.set(trade.sendPick, trade.toTeam);
    holder.set(trade.receivePick, trade.fromTeam);
  });
  return holder;
}

function assertFinalOrder(results, trades) {
  const holder = applyTrades(results, trades);
  results.forEach((r) => assert.equal(holder.get(r.pick), r.owner, `Pick #${r.pick} should end with ${r.owner}`));
}

test("no trades when the lottery keeps the pre-lottery order", () => {
  const results = [
    { pick: 1, team: "A", owner: "A", originalSlot: 1 },
    { pick: 2, team: "B", owner: "B", originalSlot: 2 },
  ];
  assert.deepEqual(computeRequiredTrades(results), []);
});

test("creates trades even when every team owns its own pick", () => {
  const results = [
    { pick: 1, team: "C", owner: "C", originalSlot: 3 },
    { pick: 2, team: "A", owner: "A", originalSlot: 1 },
    { pick: 3, team: "B", owner: "B", originalSlot: 2 },
    { pick: 4, team: "D", owner: "D", originalSlot: 4 },
  ];
  const trades = computeRequiredTrades(results);
  assert.equal(trades.length, 2, "a 3-cycle needs exactly two swaps");
  assert.equal(trades[0].summary, "C sends Pick #3 to A for Pick #1");
  assertFinalOrder(results, trades);
  assert.ok(trades.every((t) => t.sendPick !== 4 && t.receivePick !== 4), "unmoved pick is skipped");
});

test("simple swap uses a single trade", () => {
  const results = [
    { pick: 1, team: "B", owner: "B", standingIndex: 1 },
    { pick: 2, team: "A", owner: "A", standingIndex: 0 },
  ];
  const trades = computeRequiredTrades(results);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].summary, "B sends Pick #2 to A for Pick #1");
});

test("trades are made between current owners of traded picks", () => {
  const results = [
    { pick: 1, team: "Bears", owner: "Ravens", originalSlot: 2 },
    { pick: 2, team: "Titans", owner: "Titans", originalSlot: 1 },
  ];
  const trades = computeRequiredTrades(results);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].fromTeam, "Ravens");
  assert.equal(trades[0].toTeam, "Titans");
  assert.equal(trades[0].sendPickVia, "Bears");
  assertFinalOrder(results, trades);
});

test("skips swaps between picks held by the same owner", () => {
  const results = [
    { pick: 1, team: "B", owner: "X", originalSlot: 2 },
    { pick: 2, team: "A", owner: "X", originalSlot: 1 },
    { pick: 3, team: "C", owner: "C", originalSlot: 3 },
  ];
  assert.deepEqual(computeRequiredTrades(results), []);
});

test("uses minimal swaps (n - cycles) for a larger permutation", () => {
  // permutation of 8 slots with cycles (1 5 3)(2 8)(4)(6 7)
  const moves = { 1: 5, 5: 3, 3: 1, 2: 8, 8: 2, 4: 4, 6: 7, 7: 6 };
  const results = Object.entries(moves).map(([from, to]) => ({
    pick: to,
    team: `T${from}`,
    owner: `T${from}`,
    originalSlot: Number(from),
  }));
  const trades = computeRequiredTrades(results);
  assert.equal(trades.length, 8 - 4);
  assertFinalOrder(results, trades);
});

test("throws for inconsistent data", () => {
  assert.throws(() => computeRequiredTrades([{ pick: 1, team: "A", owner: "A" }]), /Invalid lottery results/);
  assert.throws(
    () => computeRequiredTrades([
      { pick: 1, team: "A", owner: "A", originalSlot: 1 },
      { pick: 2, team: "B", owner: "B", originalSlot: 3 },
    ]),
    /contiguous slots 1\.\.N/
  );
});

test("empty results return no trades", () => {
  assert.deepEqual(computeRequiredTrades([]), []);
});

test("rejects invalid slots, team names, and owners", () => {
  const valid = { pick: 1, team: "A", originalSlot: 1 };
  const invalid = [
    null,
    {},
    [null],
    [{ ...valid, pick: 0 }],
    [{ ...valid, pick: 1.5 }],
    [{ ...valid, pick: true }],
    [{ ...valid, originalSlot: null, standingIndex: 0 }],
    [{ ...valid, originalSlot: 0, standingIndex: 0 }],
    [{ pick: 1, team: "A", standingIndex: null }],
    [{ pick: 1, team: "A", standingIndex: "" }],
    [{ pick: 1, team: "A", standingIndex: false }],
    [{ pick: 1, team: "A", standingIndex: -1 }],
    [{ ...valid, team: " ", owner: "A" }],
    [{ ...valid, team: {}, owner: "A" }],
    [{ ...valid, owner: {} }],
    [{ ...valid, pick: 2, originalSlot: 2 }],
    [valid, { pick: 1, team: "B", originalSlot: 2 }],
    [valid, { pick: 2, team: "B", originalSlot: 1 }],
    [valid, { pick: 2, team: " a ", originalSlot: 2 }],
    [valid, { pick: 3, team: "B", originalSlot: 2 }],
  ];
  invalid.forEach((results) => {
    assert.throws(() => computeRequiredTrades(results), /Invalid lottery results/);
  });
});

test("defaults missing or blank owners to the original team", () => {
  for (const owner of [undefined, null, "", " "]) {
    const results = [
      { pick: 1, team: "B", owner, originalSlot: 2 },
      { pick: 2, team: "A", owner, originalSlot: 1 },
    ];
    const trades = computeRequiredTrades(results);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].summary, "B sends Pick #2 to A for Pick #1");
  }
});

test("duplicate owners reach the target through current-owner swaps in listed order", () => {
  let seed = 67890;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let run = 0; run < 200; run += 1) {
    const n = 4 + Math.floor(rand() * 12);
    const order = Array.from({ length: n }, (_, i) => i + 1);
    const owners = order.map((slot) => `Owner${slot % 3}`);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const results = order.map((originalSlot, index) => ({
      pick: index + 1,
      team: `T${originalSlot}`,
      owner: owners[originalSlot - 1],
      originalSlot,
    }));
    const trades = computeRequiredTrades(results);
    assertFinalOrder(results, trades);
    assert.ok(trades.every((trade) => trade.fromTeam !== trade.toTeam));
  }
});

test("random permutations always reach the lottery order with n - cycles swaps", () => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let run = 0; run < 200; run += 1) {
    const n = 2 + Math.floor(rand() * 15);
    const order = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const results = order.map((originalSlot, index) => ({
      pick: index + 1,
      team: `T${originalSlot}`,
      owner: `T${originalSlot}`,
      originalSlot,
    }));
    const seen = new Set();
    let cycles = 0;
    order.forEach((_, start) => {
      if (seen.has(start)) return;
      cycles += 1;
      for (let i = start; !seen.has(i); i = order[i] - 1) seen.add(i);
    });
    const trades = computeRequiredTrades(results);
    assert.equal(trades.length, n - cycles);
    assertFinalOrder(results, trades);
  }
});

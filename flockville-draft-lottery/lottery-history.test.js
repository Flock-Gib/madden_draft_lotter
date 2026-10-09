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

const savedAt = "2026-02-01T00:00:00.000Z";
const manualInput = (extra = {}) => ({
  year: 2025,
  completeness: "top-three",
  finalOrder: [
    { pick: 1, team: "Bears", owner: "Ravens" },
    { pick: 2, team: "Lions" },
    { pick: 3, team: "Jets" },
  ],
  ...extra,
});
const createManual = (input = manualInput(), existing) =>
  history.createManualRecord(input, existing, savedAt);

test("years accept only integer years and four-digit decimal strings", () => {
  for (const value of [1000, 9999, 2025, "2025", " 2025 "]) {
    assert.equal(history.sanitizeYear(value), Number(value));
  }
  for (const value of [
    999, 10000, 2025.5, "2025.5", "2025oops", "2025e0", "2.025e3",
    "02025", "0x7e9", "", " ", null, undefined, true, [], [2025], {}, NaN, Infinity,
  ]) {
    assert.equal(history.sanitizeYear(value), null, String(value));
    assert.throws(() => createManual(manualInput({ year: value })), /Year/);
    assert.equal(history.sanitizeRecord(record(value)), null);
  }
  assert.deepEqual(history.getSortedYears({ "2025junk": {}, 2024: {}, 999: {}, 2026: {} }), [2026, 2024]);
});

test("manual records normalize names, default owners, and sort contiguous picks", () => {
  const result = createManual(manualInput({
    year: "2025",
    finalOrder: [
      { pick: "3", team: " Jets ", owner: " " },
      { pick: "1", team: " Bears ", owner: " Ravens " },
      { pick: 2, team: " Lions ", owner: null },
    ],
  }));
  assert.equal(result.year, 2025);
  assert.equal(result.source, "manual");
  assert.equal(result.completeness, "top-three");
  assert.deepEqual(result.finalOrder.map(({ pick, team, owner }) => ({ pick, team, owner })), manualInput().finalOrder.map(
    (entry) => ({ ...entry, owner: entry.owner || entry.team })
  ));
});

test("manual records leave unknown draw metadata unknown rather than invent it", () => {
  const result = createManual();
  assert.equal(result.savedAt, savedAt);
  assert.equal(result.runAt, "");
  assert.equal(result.settings, null);
  assert.equal(result.totalBalls, null);
  assert.equal(result.seed, "");
  assert.equal(result.ruleVersionId, "");
  assert.deepEqual(result.odds, []);
  assert.deepEqual(result.trades, []);
  for (const entry of result.finalOrder) {
    assert.equal(entry.originalSlot, null);
    assert.equal(entry.movement, null);
    assert.equal(entry.balls, null);
    assert.equal(entry.note, "");
  }
  const imported = history.sanitizeRecord({
    ...result, savedAt: null, runAt: null, totalBalls: null, settings: null, seed: null,
    odds: [{ team: "Bears", slot: null, balls: "", percent: null }],
  });
  assert.equal(imported.savedAt, "");
  assert.equal(imported.runAt, "");
  assert.deepEqual(imported.odds[0], { team: "Bears", owner: "Bears", slot: null, balls: null, percent: null });
  assert.equal(imported.settings, null);
});

test("invalid final orders are rejected atomically, not filtered or renumbered", () => {
  const valid = manualInput().finalOrder;
  const invalidOrders = [
    null, {}, [], [null], [valid[0], null, valid[2]], Array(3),
    [valid[0], valid[0]], [valid[1], valid[2]],
    [valid[0], { ...valid[1], pick: 3 }, { ...valid[2], pick: 4 }],
    [valid[0], { ...valid[1], team: " bears " }, valid[2]],
    ...["", " ", null, 12, {}].map((team) => [{ pick: 1, team }]),
    ...[0, -1, 1.5, "1junk", "1.0", true, null, {}, Infinity].map(
      (pick) => [{ pick, team: "Bears" }]
    ),
    [{ pick: 1, team: "Bears", owner: 12 }],
  ];
  for (const finalOrder of invalidOrders) {
    const input = manualInput({ finalOrder });
    assert.throws(() => createManual(input), /Final order/);
    assert.equal(history.sanitizeRecord({ ...input, source: "manual" }), null);
    assert.equal(history.sanitizeRecord(record(2025, { finalOrder })), null);
    assert.deepEqual(history.sanitizeHistory([record(2025, { finalOrder })]), {});
    const existing = history.sanitizeHistory([record(2024)]);
    assert.deepEqual(history.upsertRecord(existing, { ...input, source: "manual" }), existing);
  }
});

test("manual completeness is required and top-three requires exactly three picks", () => {
  for (const completeness of [undefined, null, "", "partial", true]) {
    assert.throws(() => createManual(manualInput({ completeness })), /Completeness/);
    assert.equal(history.sanitizeRecord({ ...manualInput({ completeness }), source: "manual" }), null);
  }
  for (const finalOrder of [
    manualInput().finalOrder.slice(0, 2),
    [...manualInput().finalOrder, { pick: 4, team: "Bills" }],
  ]) {
    assert.throws(() => createManual(manualInput({ finalOrder })), /exactly three/);
    assert.equal(history.sanitizeRecord({ ...manualInput({ finalOrder }), source: "manual" }), null);
    assert.equal(createManual(manualInput({ finalOrder, completeness: "complete" })).completeness, "complete");
  }
  assert.equal(createManual(manualInput({ completeness: "complete" })).finalOrder.length, 3);
});

test("repeated owners are allowed because original teams, not owners, are unique", () => {
  const result = createManual(manualInput({
    finalOrder: manualInput().finalOrder.map((entry) => ({ ...entry, owner: "Ravens" })),
  }));
  assert.equal(result.finalOrder.length, 3);
});

test("manual history round-trips through exports, full app exports, and single records", () => {
  for (const completeness of ["complete", "top-three"]) {
    const result = createManual(manualInput({ completeness }));
    const h = history.upsertRecord({}, result);
    const payload = JSON.parse(JSON.stringify(history.buildHistoryExport(h, savedAt)));
    assert.deepEqual(history.extractHistoryFromPayload(payload), h);
    assert.deepEqual(history.extractHistoryFromPayload({ teams: [], lotteryHistory: h }), h);
    assert.deepEqual(history.extractHistoryFromPayload(JSON.parse(JSON.stringify(result))), h);
    assert.deepEqual(history.sanitizeRecord(result), result);
  }
});

test("manual merge conflict handling and deletion preserve other years and inputs", () => {
  const old = createManual();
  const changed = createManual(manualInput({
    finalOrder: manualInput().finalOrder.map((entry) => ({ ...entry, owner: "Bills" })),
  }));
  const existing = history.upsertRecord(history.upsertRecord({}, old), record(2024));
  const incoming = history.upsertRecord(history.upsertRecord({}, changed),
    createManual(manualInput({ year: 2026 })));
  const keep = history.mergeHistory(existing, incoming, { replaceConflicts: false });
  assert.deepEqual(keep.conflicts, [2025]);
  assert.deepEqual(keep.added, [2026]);
  assert.deepEqual(keep.merged["2025"], old);
  const replace = history.mergeHistory(existing, incoming);
  assert.deepEqual(replace.merged["2025"], changed);
  const deleted = history.removeYear(replace.merged, "2025");
  assert.deepEqual(history.getSortedYears(deleted), [2026, 2024]);
  assert.deepEqual(existing["2025"], old);
  assert.deepEqual(incoming["2025"], changed);
});

test("unchanged manual edits preserve optional draw and per-pick metadata without mutating it", () => {
  const existing = history.sanitizeRecord(record(2025, {
    finalOrder: manualInput().finalOrder.map((entry, index) => ({
      ...entry, originalSlot: 3 - index, balls: index + 1, note: `note ${index}`,
    })),
    totalBalls: 6, seed: "audit", ruleVersionId: "rules-1",
    settings: { lotteryPickCount: 3, bottomFourProtection: false },
  }));
  const snapshot = JSON.parse(JSON.stringify(existing));
  const result = createManual(manualInput({
    finalOrder: manualInput().finalOrder.map((entry) => ({
      ...entry, team: entry.team.toUpperCase(), owner: (entry.owner || entry.team).toUpperCase(),
    })),
  }), existing);
  for (const field of ["runAt", "odds", "trades", "settings", "seed", "totalBalls", "ruleVersionId"]) {
    assert.deepEqual(result[field], existing[field]);
  }
  result.finalOrder.forEach((entry, index) => {
    for (const field of ["originalSlot", "movement", "balls", "note"]) {
      assert.deepEqual(entry[field], existing.finalOrder[index][field]);
    }
  });
  assert.equal(result.savedAt, savedAt);
  assert.deepEqual(existing, snapshot);
  assert.notEqual(result.settings, existing.settings);
  assert.notEqual(result.finalOrder[0], existing.finalOrder[0]);
});

test("changed picks drop stale trades and odds but preserve metadata on unchanged picks", () => {
  const existing = history.sanitizeRecord(record(2025, {
    finalOrder: manualInput().finalOrder.map((entry, index) => ({
      ...entry, originalSlot: index + 1, balls: 3, note: "known",
    })),
    totalBalls: 9, seed: "old",
  }));
  for (const finalOrder of [
    [manualInput().finalOrder[0], { pick: 2, team: "Jets" }, { pick: 3, team: "Lions" }],
    [manualInput().finalOrder[0], { pick: 2, team: "Bills" }, manualInput().finalOrder[2]],
    [manualInput().finalOrder[0], { pick: 2, team: "Lions", owner: "Bills" }, manualInput().finalOrder[2]],
    manualInput().finalOrder.slice(0, 2),
  ]) {
    const result = createManual(manualInput({ completeness: "complete", finalOrder }), existing);
    assert.deepEqual(result.odds, []);
    assert.deepEqual(result.trades, []);
    assert.equal(result.totalBalls, null);
    assert.equal(result.seed, "");
    assert.equal(result.finalOrder[0].balls, 3);
    assert.equal(result.finalOrder[0].note, "known");
    if (finalOrder.length === 3) {
      assert.equal(result.finalOrder[1].balls, null);
      assert.equal(result.finalOrder[1].originalSlot, null);
      assert.equal(result.finalOrder[1].movement, null);
      assert.equal(result.finalOrder[1].note, "");
    }
  }
});

test("manual metadata from another year or an invalid record is never inherited", () => {
  for (const existing of [record(2024), record("2025junk"), record(2025, { finalOrder: [] })]) {
    assert.deepEqual(createManual(manualInput(), existing), createManual());
  }
});

test("legacy drawn records retain their defaults and optional explicit source", () => {
  const result = history.sanitizeRecord(record(2025));
  assert.equal(result.settings.lotteryPickCount, 8);
  assert.equal(result.settings.topThreeCooldown, true);
  assert.equal(result.totalBalls, 0);
  assert.equal(result.finalOrder[0].balls, 0);
  assert.equal(result.savedAt, result.runAt);
  assert.equal(result.source, undefined);
  assert.equal(result.completeness, undefined);
  const tagged = history.sanitizeRecord(record(2025, { source: "drawn", completeness: "complete" }));
  assert.equal(tagged.source, "drawn");
  assert.equal(tagged.completeness, "complete");
  assert.deepEqual(history.extractHistoryFromPayload(history.buildHistoryExport({ 2025: tagged })), { 2025: tagged });
});

const protectionTeams = () => [
  { id: "1", name: " BEARS ", owner: "Ravens", previousTopThree: false, previousNumberOne: false },
  { id: "2", name: "Lions", owner: "Bears", previousTopThree: false, previousNumberOne: true },
  { id: "3", name: "jets", owner: "Jets", previousTopThree: false, previousNumberOne: true },
  { id: "4", name: "Ravens", owner: "Ravens", previousTopThree: true, previousNumberOne: true },
];

test("protection derives exact prior-year flags from original team, never traded owner", () => {
  const teams = protectionTeams();
  const snapshot = JSON.parse(JSON.stringify(teams));
  const h = history.upsertRecord({}, createManual());
  const result = history.deriveProtection(teams, h, "2026");
  assert.equal(result.priorYear, 2025);
  assert.equal(result.automatic, true);
  assert.deepEqual(result.record, h["2025"]);
  assert.deepEqual(result.teams.map(({ previousTopThree, previousNumberOne }) => [previousTopThree, previousNumberOne]),
    [[true, true], [true, false], [true, false], [false, false]]);
  assert.deepEqual(teams, snapshot);
  result.teams.forEach((team, index) => assert.notEqual(team, teams[index]));
  assert.equal(result.teams[0].owner, "Ravens");
});

test("protection supports legacy complete drawn history and resets non-top-three flags", () => {
  const h = history.sanitizeHistory([record(2025, {
    finalOrder: [...manualInput().finalOrder, { pick: 4, team: "Ravens" }],
  })]);
  const result = history.deriveProtection(protectionTeams(), h, 2026);
  assert.equal(result.automatic, true);
  assert.equal(result.teams[3].previousTopThree, false);
  assert.equal(result.teams[3].previousNumberOne, false);
});

test("missing exact prior year never falls back to older, current, or future history", () => {
  const teams = protectionTeams();
  const h = history.sanitizeHistory([record(2024), record(2026), record(2027)]);
  for (const source of [h, {}, null, { 2025: record(2024) }, { 2025: record(2025, { finalOrder: [] }) }]) {
    const result = history.deriveProtection(teams, source, 2026);
    assert.equal(result.priorYear, 2025);
    assert.equal(result.record, null);
    assert.equal(result.automatic, false);
    assert.deepEqual(result.teams, teams);
    assert.notEqual(result.teams[0], teams[0]);
  }
});

test("manual override keeps original checkbox flags but reports available prior source", () => {
  const teams = protectionTeams();
  const h = history.upsertRecord({}, createManual());
  const result = history.deriveProtection(teams, h, 2026, true);
  assert.equal(result.priorYear, 2025);
  assert.equal(result.automatic, false);
  assert.deepEqual(result.record, h["2025"]);
  assert.deepEqual(result.teams, teams);
  assert.notEqual(result.teams[0], teams[0]);
});

test("invalid active year and year boundary safely fall back to checkbox flags", () => {
  const teams = protectionTeams();
  for (const year of ["2026bad", 2026.5, null, undefined, 1000]) {
    const result = history.deriveProtection(teams, { 999: record(999), 2025: createManual() }, year);
    assert.equal(result.automatic, false);
    assert.equal(result.record, null);
    assert.equal(result.priorYear, year === 1000 ? 999 : null);
    assert.deepEqual(result.teams, teams);
  }
});

test("deleting prior year switches protection back to the original checkbox flags", () => {
  const teams = protectionTeams();
  const h = history.upsertRecord({}, createManual());
  const deleted = history.removeYear(h, 2025);
  assert.equal(history.deriveProtection(teams, h, 2026).automatic, true);
  const result = history.deriveProtection(teams, deleted, 2026);
  assert.equal(result.automatic, false);
  assert.deepEqual(result.teams, teams);
});

test("archive and finalization flags are additive booleans and survive history exports", () => {
  for (const archived of [true, false]) {
    for (const finalized of [true, false]) {
      const safe = history.sanitizeRecord(record(2025, { archived, finalized }));
      assert.equal(safe.archived, archived);
      assert.equal(safe.finalized, finalized);
      assert.deepEqual(history.extractHistoryFromPayload(JSON.parse(JSON.stringify(
        history.buildHistoryExport({ 2025: safe })
      ))), { 2025: safe });
    }
  }
  const legacy = history.sanitizeRecord(record(2025));
  assert.equal(Object.hasOwn(legacy, "archived"), false);
  assert.equal(Object.hasOwn(legacy, "finalized"), false);
  const invalid = history.sanitizeRecord(record(2025, { archived: "false", finalized: 1 }));
  assert.equal(Object.hasOwn(invalid, "archived"), false);
  assert.equal(Object.hasOwn(invalid, "finalized"), false);
});

test("saved dry-run records preserve their simulation source through sanitization, upserts and exports", () => {
  const simulated = record(2026, { source: "dry-run", archived: false, finalized: false });
  const sanitized = history.sanitizeRecord(simulated);
  assert.equal(sanitized.source, "dry-run");
  const stored = history.upsertRecord({}, simulated);
  assert.equal(stored["2026"].source, "dry-run");
  assert.deepEqual(history.sanitizeHistory(stored), stored);
  const imported = history.extractHistoryFromPayload(JSON.parse(JSON.stringify(history.buildHistoryExport(stored))));
  assert.deepEqual(imported, stored);
  assert.equal(imported["2026"].source, "dry-run");
});

test("optional dry-run team snapshots are sanitized, detached and preserved through save and export", () => {
  const teams = [
    { id: " A ", name: " Bears ", owner: " Jets ", previousTopThree: true, previousNumberOne: false,
      winPct: "0.25", sos: 0.5, headToHead: { Jets: { wins: 1, losses: 2, extra: { ignored: true } }, Bills: -1 },
      unexpected: "drop" },
    { name: "Jets", headToHead: JSON.parse('{"__proto__":{"wins":1},"Bears":{"aWins":"2","bWins":0},"bad":true}') },
    { name: {} }, null,
  ];
  const simulated = record(2026, { source: "dry-run", teams });
  const stored = history.upsertRecord({}, simulated);
  const snapshot = stored["2026"].teams;
  assert.deepEqual(snapshot[0], {
    id: "A", name: "Bears", owner: "Jets", previousTopThree: true, previousNumberOne: false,
    winPct: 0.25, sos: 0.5, headToHead: { Jets: { wins: 1, losses: 2 }, Bills: -1 },
  });
  assert.deepEqual(snapshot[1].headToHead, { Bears: { aWins: 2, bWins: 0 } });
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[1].owner, "Jets");
  assert.notEqual(snapshot[0].headToHead.Jets, teams[0].headToHead.Jets);
  teams[0].name = "Changed live team";
  teams[0].owner = "Changed live owner";
  teams[0].headToHead.Jets.wins = 99;
  assert.equal(snapshot[0].name, "Bears");
  assert.equal(snapshot[0].owner, "Jets");
  assert.equal(snapshot[0].headToHead.Jets.wins, 1);
  assert.deepEqual(history.extractHistoryFromPayload(JSON.parse(JSON.stringify(history.buildHistoryExport(stored)))), stored);
  assert.equal(Object.hasOwn(history.sanitizeRecord(record(2026)), "teams"), false);
});

test("reviewed manual and auto trades retain app metadata through sanitization and manual edits", () => {
  const reviewedTrades = [
    { id: "manual-id", fromTeam: " Bears ", toTeam: " Jets ", assets: ["Player A", "2028 first-round pick"],
      notes: " Commissioner approved ", createdAt: savedAt, source: "manual", ignored: "not persisted" },
    { id: "auto-id", fromTeam: "Jets", toTeam: "Bears", assets: ["Jets sends Pick #2", "Bears sends Pick #1"],
      notes: "Auto-generated", createdAt: savedAt, source: "auto" },
    { from: "Bears", to: "Jets", assets: "Player B\nPlayer C", notes: "Legacy aliases" },
    null, { fromTeam: "Bears", toTeam: "Jets" }, { fromTeam: {}, toTeam: "Jets", notes: "Bad team" },
  ];
  const existing = history.sanitizeRecord(record(2025, {
    finalOrder: manualInput().finalOrder, reviewedTrades, archived: true, finalized: false,
  }));
  assert.equal(existing.reviewedTrades.length, 3);
  assert.deepEqual(existing.reviewedTrades[0], {
    id: "manual-id", fromTeam: "Bears", toTeam: "Jets", assets: ["Player A", "2028 first-round pick"],
    notes: "Commissioner approved", createdAt: savedAt, source: "manual",
  });
  assert.deepEqual(existing.reviewedTrades[2].assets, ["Player B", "Player C"]);
  assert.equal(existing.reviewedTrades[2].id, "");
  assert.equal(Object.hasOwn(history.sanitizeRecord(record(2025)), "reviewedTrades"), false);
  const snapshot = JSON.stringify(existing);
  for (const input of [manualInput(), manualInput({
    finalOrder: manualInput().finalOrder.map((entry) => ({ ...entry, owner: "Bills" })),
  })]) {
    const result = createManual(input, existing);
    assert.deepEqual(result.reviewedTrades, existing.reviewedTrades);
    assert.equal(result.archived, true);
    assert.equal(result.finalized, false);
    assert.notEqual(result.reviewedTrades[0].assets, existing.reviewedTrades[0].assets);
    const h = { 2025: result };
    assert.deepEqual(history.extractHistoryFromPayload(JSON.parse(JSON.stringify(history.buildHistoryExport(h)))), h);
  }
  assert.equal(JSON.stringify(existing), snapshot);
});

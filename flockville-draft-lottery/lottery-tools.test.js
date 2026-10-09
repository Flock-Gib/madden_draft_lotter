const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const history = require("./lottery-history.js");
const tools = require("./lottery-tools.js");

const record = (year, extra = {}) => ({
  year,
  finalOrder: [{ pick: 1, team: "Bears" }, { pick: 2, team: "Jets", owner: "Bears" }],
  ...extra,
});
const results = Array.from({ length: 12 }, (_, index) => ({
  pick: index + 1, team: `Team ${index + 1}`, owner: index === 0 ? "Traded owner" : `Team ${index + 1}`,
}));

test("checksums use canonical SHA-256, ignore only top-level checksum, and never mutate payloads", async () => {
  const payload = { z: [{ b: 2, a: 1 }], a: { _checksum: "nested", d: true }, _checksum: "old" };
  const snapshot = JSON.stringify(payload);
  const signed = await tools.withChecksum(payload);
  assert.equal(signed._checksum, createHash("sha256").update(
    '{"a":{"_checksum":"nested","d":true},"z":[{"a":1,"b":2}]}'
  ).digest("hex"));
  assert.equal(JSON.stringify(payload), snapshot);
  assert.deepEqual(await tools.verifyChecksum(signed), { present: true, valid: true });
  assert.deepEqual(await tools.verifyChecksum({
    _checksum: signed._checksum, a: { d: true, _checksum: "nested" }, z: [{ a: 1, b: 2 }],
  }), { present: true, valid: true });
  signed.a._checksum = "edited";
  assert.deepEqual(await tools.verifyChecksum(signed), { present: true, valid: false });
  assert.equal(payload.a._checksum, "nested");
});

test("legacy checksum absence is allowed; malformed and tampered checksums are warned", async () => {
  assert.deepEqual(await tools.verifyChecksum({ teams: [] }), { present: false, valid: true });
  for (const _checksum of [null, false, 1, {}, "", "sha256:abc", "g".repeat(64)]) {
    assert.deepEqual(await tools.verifyChecksum({ _checksum }), { present: true, valid: false });
  }
  const payload = await tools.withChecksum({ teams: ["Bears"], picks: [1, 2] });
  assert.equal((await tools.verifyChecksum({ ...payload, _checksum: payload._checksum.toUpperCase() })).valid, true);
  payload.picks.reverse();
  assert.equal((await tools.verifyChecksum(payload)).valid, false);
  await assert.rejects(tools.withChecksum([]), /JSON object/);
});

test("UMD exposes the same helpers in browsers using browser Web Crypto and history", async () => {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder });
  vm.runInContext(readFileSync(`${__dirname}/lottery-history.js`, "utf8"), context);
  vm.runInContext(readFileSync(`${__dirname}/lottery-tools.js`, "utf8"), context);
  const signed = await context.lotteryTools.withChecksum({ hello: "browser" });
  assert.equal((await context.lotteryTools.verifyChecksum(signed)).valid, true);
  assert.equal(context.lotteryTools.buildBracket(results, 6).matches.length, 4);
});

test("recovery supports valid app, history export, single record, raw map, array and BOM", () => {
  const expected = history.sanitizeHistory([record(2025)]);
  for (const payload of [
    { lotteryHistory: { 2025: record(2025) }, teams: [] },
    history.buildHistoryExport(expected),
    record(2025),
    { 2025: record(2025) },
    [record(2025)],
  ]) {
    assert.deepEqual(tools.recoverHistory(JSON.stringify(payload)), expected);
    assert.deepEqual(tools.recoverHistory(`\uFEFF${JSON.stringify(payload)}`), expected);
  }
});

test("recovery extracts only intact nested records from truncated or corrupt JSON", () => {
  const first = record(2025, {
    seed: 'quoted " } { \\ seed',
    finalOrder: [{ pick: 1, team: 'Bears } { " \\' }, { pick: 2, team: "Jets" }],
  });
  const second = record(2026);
  const expected = history.sanitizeHistory([first, second]);
  const text = `{"lotteryHistory":{"2025":${JSON.stringify(first)},broken, "2026":${JSON.stringify(second)},"2027":{"year":2027,"finalOrder":[`;
  assert.deepEqual(tools.recoverHistory(text), expected);
  const withoutYear = { ...first };
  delete withoutYear.year;
  assert.deepEqual(tools.recoverHistory(`{"lotteryHistory":{"2025":${JSON.stringify(withoutYear)},`),
    history.sanitizeHistory([first]));
  assert.deepEqual(tools.recoverHistory(`{"wrapper":{"record":${JSON.stringify(first)}} garbage`),
    history.sanitizeHistory([first]));
});

test("recovery never executes input, repairs invalid orders, or invents missing picks", () => {
  const bad = record(2026, { finalOrder: [{ pick: 1, team: "A" }, { pick: 3, team: "C" }] });
  const incomplete = '{"year":2027,"finalOrder":[{"pick":1,"team":"C"}';
  assert.deepEqual(tools.recoverHistory(`{ broken, "2026":${JSON.stringify(bad)}, "2027":${incomplete}`), {});
  assert.deepEqual(tools.recoverHistory("globalThis.__recoveryExecuted = true;"), {});
  assert.equal(globalThis.__recoveryExecuted, undefined);
  assert.deepEqual(tools.recoverHistory(null), {});
  assert.deepEqual(tools.recoverHistory(JSON.stringify({ __proto__: record(2025) })), {});
});

test("trade CSV preserves manual assets and notes without manufacturing pick numbers", () => {
  const output = tools.tradesCsv([{
    fromTeam: "Bears", toTeam: "Jets", assets: ["Player A", "2028 first-round pick #9"],
    notes: 'Deal, "approved"\nNext step', source: "manual",
  }]);
  assert.equal(output.split("\r\n")[0], "Pick#,FromTeam,ToTeam,FromPick,ToPick,Notes,AutoGenerated");
  assert.ok(output.includes('"","Bears","Jets","","",'));
  assert.ok(output.includes('Assets: Player A; 2028 first-round pick #9 — Deal, ""approved""\nNext step'));
  assert.ok(output.endsWith('"N"'));
});

test("auto app trades and required swaps export known pick metadata and ownership", () => {
  const output = tools.tradesCsv([
    { fromTeam: "A", toTeam: "B", sendPick: 4, sendPickVia: "C", receivePick: 1, summary: "swap" },
    { fromTeam: "A", toTeam: "B", source: "auto", assets: [
      "A sends Pick #4 (originally C)", "B sends Pick #1",
    ], notes: "Reviewed" },
  ]);
  assert.equal(output.match(/"4","A","B","4 \(originally C\)","1"/g).length, 2);
  assert.equal(output.match(/"Y"/g).length, 2);
  assert.ok(output.includes("Reviewed"));
});

test("CSV quotes separators and neutralizes formula injection in every user-controlled cell", () => {
  const output = tools.tradesCsv([{
    fromTeam: " =HYPERLINK(\"evil\")", toTeam: "+CMD", fromPick: "-1", toPick: "@SUM(1)",
    notes: "\t=calc()", source: "manual",
  }]);
  for (const escaped of ['"\' =HYPERLINK(""evil"")"', '"\'+CMD"', '"\'-1"', '"\'@SUM(1)"', '"\'\t=calc()"']) {
    assert.ok(output.includes(escaped), escaped);
  }
  assert.equal(tools.tradesCsv([]), "Pick#,FromTeam,ToTeam,FromPick,ToPick,Notes,AutoGenerated");
});

test("trade tables retain assets and notes but cannot close their Discord code fence", () => {
  const output = tools.tradesTable([{
    fromTeam: "A```", toTeam: "B", source: "manual", assets: ["Player\tA"], notes: "Note\n```spoof",
  }]);
  assert.equal(output.match(/```/g).length, 2);
  assert.ok(output.includes("Player A"));
  assert.ok(output.includes("Note '''spoof"));
  assert.ok(output.includes("AutoGenerated"));
});

test("power-of-two brackets use standard seed placement and traded owners without mutation", () => {
  const input = results.slice(0, 8).reverse();
  const snapshot = JSON.stringify(input);
  const bracket = tools.buildBracket(input, 8);
  assert.deepEqual(bracket.matches.map(({ home, away }) => [home.seed, away.seed]), [[1, 8], [4, 5], [2, 7], [3, 6]]);
  assert.deepEqual(bracket.seeds[0], { seed: 1, team: "Team 1", owner: "Traded owner", pick: 1 });
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(tools.buildBracket(results, 2).matches.map(({ home, away }) => [home.seed, away.seed]), [[1, 2]]);
});

test("six and twelve-team brackets award byes to highest seeds and keep valid tournament paths", () => {
  for (const count of [6, 12]) {
    const bracket = tools.buildBracket(results, count);
    const size = count === 6 ? 8 : 16;
    assert.equal(bracket.matches.length, size / 2);
    assert.deepEqual(bracket.matches.filter(({ away }) => away === null).map(({ home }) => home.seed).sort((a, b) => a - b),
      Array.from({ length: size - count }, (_, index) => index + 1));
    assert.deepEqual(bracket.matches.flatMap(({ home, away }) => [home.seed, ...(away ? [away.seed] : [])]).sort((a, b) => a - b),
      Array.from({ length: count }, (_, index) => index + 1));
    const topSeedMatches = bracket.matches.map(({ home, away }) => [home.seed, away?.seed]);
    assert.equal(topSeedMatches[0][0], 1);
    assert.equal(topSeedMatches[size / 4][0], 2);
  }
});

test("brackets wrap picks explicitly when count exceeds results, including the sixty-four limit", () => {
  const bracket = tools.buildBracket(results.slice(0, 3), 6);
  assert.deepEqual(bracket.seeds.map(({ seed, pick }) => [seed, pick]), [[1, 1], [2, 2], [3, 3], [4, 1], [5, 2], [6, 3]]);
  assert.equal(tools.buildBracket(results.slice(0, 1), 64).matches.length, 32);
  for (const count of [undefined, null, 0, 1, 65, 2.5, "6", true, NaN, Infinity]) {
    assert.throws(() => tools.buildBracket(results, count), /integer from 2 to 64/);
  }
  for (const input of [[], null, [null], [{ pick: 1, team: "" }], [{ pick: "1", team: "A" }]]) {
    assert.throws(() => tools.buildBracket(input, 6), /nonempty results/);
  }
});

test("bracket CSV and Discord text preserve owners, picks, byes and neutralize injections", () => {
  const bracket = tools.buildBracket([{ pick: 1, team: "=A```", owner: "+B" }], 3);
  const output = tools.bracketCsv(bracket);
  assert.ok(output.includes('"\'=A```","\'+B","1"'));
  assert.ok(output.includes('"BYE"'));
  const text = tools.bracketText(bracket);
  assert.ok(text.includes("owner: +B; pick #1"));
  assert.ok(text.includes("BYE"));
  assert.equal(text.match(/```/g).length, 2);
});

test("rule changes describe only changed settings, including unknown legacy values", () => {
  const previous = { lotteryPickCount: 8, bottomFourProtection: true, topThreeCooldown: true, noConsecutiveNumberOne: true };
  assert.deepEqual(tools.ruleChanges(previous, { ...previous }), []);
  assert.deepEqual(tools.ruleChanges(previous, { ...previous, lotteryPickCount: 6, topThreeCooldown: false }), [
    "Lottery picks: 8 → 6", "Top-three cooldown: On → Off",
  ]);
  assert.deepEqual(tools.ruleChanges({}, { noConsecutiveNumberOne: true }), ["No consecutive #1 picks: Not set → On"]);
  assert.deepEqual(tools.ruleChanges(null, null), []);
});

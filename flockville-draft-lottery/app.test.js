const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const history = require("./lottery-history.js");

const source = fs.readFileSync(`${__dirname}/app.js`, "utf8").split("\nels.addTeamBtn.addEventListener")[0];

function app(storage = new Map()) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", checked: false, textContent: "", innerHTML: "", files: [],
      appendChild() {}, focus() {}, classList: { add() {}, remove() {} },
    });
    return nodes.get(id);
  };
  const messages = [];
  const confirmations = [];
  const context = vm.createContext({
    crypto, console,
    document: { getElementById: node, querySelector: node, createElement: () => node(crypto.randomUUID()) },
    lotteryHistory: history,
    lotteryOrder: require("./lottery-order.js"),
    lotteryTrades: require("./lottery-trades.js"),
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    confirm: (text) => { confirmations.push(text); return context.acceptConfirmation; },
    acceptConfirmation: true,
    messages,
  });
  vm.runInContext(source, context);
  vm.runInContext("render = () => persistState(); showToast = (message) => messages.push(message);", context);
  const evaluate = (code) => vm.runInContext(code, context);
  const state = evaluate("state");
  node("lotteryPickCount").value = "8";
  ["bottomProtectionToggle", "topThreeCooldownToggle", "consecutiveOneToggle"].forEach((id) => { node(id).checked = true; });
  state.seasonYear = 2026;
  node("seasonYearInput").value = "2026";
  state.teams = Array.from({ length: 8 }, (_, index) => ({
    id: String(index), name: `Team ${index}`, owner: `Team ${index}`,
    previousTopThree: false, previousNumberOne: false,
  }));
  return { evaluate, state, node, context, storage, messages, confirmations };
}

function prior(year = 2025, names = ["Team 0", "Team 1", "Team 2"]) {
  return history.createManualRecord({
    year, completeness: "top-three",
    finalOrder: names.map((team, index) => ({ pick: index + 1, team, owner: "Outside Owner" })),
  });
}

test("manual prior order drives two consecutive seasons with independent rule toggles", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  const first = a.evaluate("runLotteryCalculation(() => 0)");
  assert.equal(first[0].team, "Team 3");
  assert.ok(first.slice(0, 3).every((entry) => !["Team 0", "Team 1", "Team 2"].includes(entry.team)));
  a.node("topThreeCooldownToggle").checked = false;
  assert.equal(a.evaluate("runLotteryCalculation(() => 0)")[0].team, "Team 1");
  a.node("consecutiveOneToggle").checked = false;
  assert.equal(a.evaluate("runLotteryCalculation(() => 0)")[0].team, "Team 0");
  a.node("topThreeCooldownToggle").checked = true;
  a.node("consecutiveOneToggle").checked = true;
  a.state.lotteryHistory = history.upsertRecord(a.state.lotteryHistory, {
    year: 2026, finalOrder: first, settings: a.evaluate("getSettingsFromUi()"),
  });
  a.state.seasonYear = 2027;
  const second = a.evaluate("runLotteryCalculation(() => 0)");
  assert.notEqual(second[0].team, first[0].team);
  assert.ok(second.slice(0, 3).every((entry) => !first.slice(0, 3).some((pick) => pick.team === entry.team)));
});

test("exact year, history import/edit/delete, team addition, and manual fallback have no stale automatic flags", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), true);
  assert.equal(a.state.teams[0].previousNumberOne, false);
  a.state.seasonYear = 2027;
  assert.equal(a.evaluate("getProtection().automatic"), false);
  a.state.seasonYear = 2026;
  a.context.incoming = history.upsertRecord({}, prior(2025, ["Team 3", "Team 4", "Team 5"]));
  a.context.acceptConfirmation = false;
  a.evaluate("mergeImportedHistory(incoming)");
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), true);
  a.context.acceptConfirmation = true;
  a.evaluate("mergeImportedHistory(incoming)");
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), false);
  assert.equal(a.evaluate("getProtection().teams[3].previousNumberOne"), true);
  a.state.teams = a.state.teams.filter((team) => team.name !== "Team 3");
  a.evaluate('addTeam("Team 3", "Outside Owner")');
  assert.equal(a.evaluate("getProtection().teams.at(-1).previousNumberOne"), true);
  a.state.selectedHistoryYear = "2025";
  a.evaluate("deleteSelectedHistoryYear()");
  assert.equal(a.evaluate("getProtection().automatic"), false);
  assert.ok(a.state.teams.every((team) => !team.previousNumberOne));
  a.state.teams[0].previousNumberOne = true;
  a.state.manualProtectionYear = 2026;
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), true);
  assert.equal(a.evaluate("runLotteryCalculation(() => 0)")[0].team, "Team 1");
});

test("missing history requires explicit fallback before start; impossible rules do not silently relax", () => {
  const a = app();
  a.evaluate("startLottery()");
  assert.match(a.messages.at(-1), /Missing 2025 history/);
  assert.equal(a.state.lastRunMeta, null);
  a.state.manualProtectionYear = 2026;
  a.state.teams.forEach((team) => { team.previousNumberOne = true; });
  a.evaluate("startLottery()");
  assert.match(a.messages.at(-1), /No eligible team for Pick #1/);
  assert.equal(a.state.results.length, 0);
});

test("configured short draw still protects all top-three placements", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.node("lotteryPickCount").value = "1";
  const results = a.evaluate("runLotteryCalculation(() => 0)");
  assert.ok(results.slice(0, 3).every((entry) => !entry.previousTopThree));
});

test("bottom-four adjustment preserves drawn top three and protects slots 1 through 8", () => {
  const a = app();
  a.state.teams = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), name: `Team ${index}`, owner: `Team ${index}`,
    previousTopThree: index < 3, previousNumberOne: index === 0,
  }));
  a.state.manualProtectionYear = 2026;
  const protectedResults = a.evaluate("runLotteryCalculation(() => 0.999)");
  a.node("bottomProtectionToggle").checked = false;
  const raw = a.evaluate("runLotteryCalculation(() => 0.999)");
  assert.deepEqual(protectedResults.slice(0, 3).map((pick) => pick.id), raw.slice(0, 3).map((pick) => pick.id));
  assert.ok(protectedResults.filter((pick) => Number(pick.id) < 4).every((pick) => pick.pick <= 8));
  assert.ok(protectedResults.slice(0, 3).every((pick) => !pick.previousTopThree));
});

test("weights and first-draw odds reflect protection; seeded draws repeat", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  const data = a.evaluate("buildLotteryTransparencyData()");
  assert.equal(data.totalBalls, 20);
  assert.equal(data.eligibleBalls, 11);
  assert.equal(data.entries[0].percent, 0);
  assert.equal(data.entries[3].percent, 3 / 11 * 100);
  assert.ok(Math.abs(data.totalPercent - 100) < 1e-10);
  assert.deepEqual(Array.from(data.entries, (entry) => entry.balls), [3, 3, 3, 3, 2, 2, 2, 2]);
  a.state.seedEnabled = true;
  a.state.seedText = "audit";
  assert.deepEqual(a.evaluate("runLotteryCalculation(getRandomSource().randomFn)"),
    a.evaluate("runLotteryCalculation(getRandomSource().randomFn)"));
});

test("history, full-state metadata, manual override, and current results survive localStorage reload", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.manualProtectionYear = 2026;
  a.state.results = a.evaluate("runLotteryCalculation(() => 0.5)");
  a.state.lastRunMeta = a.evaluate("buildRunMeta('audit')");
  a.evaluate("persistState(); persistHistory()");
  const b = app(a.storage);
  b.evaluate("restoreStateFromStorage(); restoreHistoryFromStorage()");
  assert.equal(b.state.manualProtectionYear, 2026);
  assert.equal(b.state.lastRunMeta.year, 2026);
  assert.equal(b.state.results.length, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(b.state.lotteryHistory)), JSON.parse(JSON.stringify(a.state.lotteryHistory)));
  assert.deepEqual(Array.from(b.state.results, (pick) => pick.team), Array.from(a.state.results, (pick) => pick.team));
  const current = JSON.stringify(b.state.results);
  b.state.selectedHistoryYear = "2025";
  b.evaluate("buildHistoryDetailMarkup(state.lotteryHistory['2025'])");
  assert.equal(JSON.stringify(b.state.results), current);
});

test("finalization uses recorded draw year, not viewed year, and reset keeps history", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.results = a.evaluate("runLotteryCalculation(() => 0)");
  a.state.lastRunMeta = a.evaluate("buildRunMeta('')");
  a.context.runContext = { year: 2026, odds: [], totalBalls: 20 };
  a.evaluate("saveLotteryToHistory(state.results, runContext)");
  a.state.seasonYear = 2029;
  a.evaluate("finalizeSeason()");
  assert.equal(a.state.seasonHistory[0].year, 2026);
  assert.equal(a.state.seasonYear, 2027);
  assert.equal(a.evaluate("getProtection().automatic"), true);
  assert.equal(a.state.results.length, 0);
  assert.ok(a.state.teams.every((team) => !team.previousNumberOne));
  a.evaluate("resetApp()");
  assert.equal(a.state.teams.length, 0);
  assert.deepEqual(Object.keys(a.state.lotteryHistory), ["2025", "2026"]);
});

test("legacy full-state import retains unassigned seasons and never guesses a live result year", () => {
  const a = app();
  a.context.payload = {
    teams: a.state.teams,
    seasonHistory: [{ topThree: ["Team 0", "Team 1", "Team 2"], finalOrder: prior().finalOrder }],
    results: [{ team: "Team 0", pick: 1 }],
  };
  const restored = a.evaluate("sanitizeImportedPayload(payload)");
  assert.equal(restored.seasonHistory[0].year, null);
  assert.equal(restored.manualProtectionYear, null);
  a.state.results = restored.results;
  a.evaluate("finalizeSeason()");
  assert.match(a.messages.at(-1), /no verified season year/);
  assert.equal(a.state.seasonHistory.length, 0);
});

test("inconsistent trade results surface errors in UI and generation instead of no-trades success", () => {
  const a = app();
  a.state.results = [{ team: "Team 0", owner: "Team 0", pick: 1, originalSlot: null }];
  a.evaluate("renderRequiredTrades(); generateTradesFromResults()");
  assert.match(a.node("requiredTradesList").innerHTML, /Cannot calculate trades/);
  assert.match(a.messages.at(-1), /Cannot generate trades/);
  assert.equal(a.state.trades.length, 0);
});

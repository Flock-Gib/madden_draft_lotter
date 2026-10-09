const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const history = require("./lottery-history.js");
const tools = require("./lottery-tools.js");

const source = fs.readFileSync(`${__dirname}/app.js`, "utf8").split("\nels.addTeamBtn.addEventListener")[0];

function app(storage = new Map()) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", checked: false, textContent: "", files: [],
      children: [], listeners: {}, dataset: {},
      get innerHTML() { return this.markup || ""; },
      set innerHTML(value) { this.markup = value; this.children = []; },
      appendChild(child) { this.children.push(child); },
      insertBefore(child) { this.children.unshift(child); },
      querySelector(selector) { return node(`${id}:${selector}`); },
      querySelectorAll(selector) {
        if (selector === "input") return this.children.map((child) => child.querySelector("input"));
        return [];
      },
      addEventListener(event, listener) { this.listeners[event] = listener; },
      focus() {}, classList: { add() {}, remove() {} },
    });
    return nodes.get(id);
  };
  const messages = [];
  const confirmations = [];
  const context = vm.createContext({
    crypto, console,
    document: { getElementById: node, querySelector: node, querySelectorAll: () => [], createElement: () => node(crypto.randomUUID()) },
    lotteryHistory: history,
    lotteryOrder: require("./lottery-order.js"),
    lotteryTrades: require("./lottery-trades.js"),
    lotteryTools: tools,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    confirm: (text) => { confirmations.push(text); return context.acceptConfirmation; },
    acceptConfirmation: true,
    messages,
    downloads: [],
    navigator: { clipboard: { writeText: async (text) => { context.clipboardText = text; } } },
  });
  vm.runInContext(source, context);
  vm.runInContext("render = () => persistState(); showToast = (message) => messages.push(message);", context);
  vm.runInContext("downloadJsonFile = (name, payload) => downloads.push({ name, payload });", context);
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
  a.state.lastRunMeta.completed = true;
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
  a.state.lastRunMeta.completed = true;
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

test("team dropdown edits live entries rather than history-derived display clones", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.evaluate("renderTeams()");
  const select = a.node("teamTableBody").children[0].querySelector(".team-name-edit");
  select.listeners.change({ target: { value: "Chicago Bears" } });
  assert.equal(a.state.teams[0].name, "Chicago Bears");
  assert.equal(a.state.teams[0].owner, "Chicago Bears");
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), false);
});

test("reload cannot present an interrupted animation as a completed lottery", () => {
  const a = app();
  a.state.results = a.evaluate("runLotteryCalculation(() => 0)").slice(0, 2);
  a.state.lastRunMeta = a.evaluate("buildRunMeta('')");
  a.evaluate("persistState()");
  const b = app(a.storage);
  b.evaluate("restoreStateFromStorage()");
  assert.equal(b.state.results.length, 0);
  assert.equal(b.state.lastRunMeta, null);
  assert.equal(b.state.teams.length, 8);
});

function addTrade(a, notes) {
  a.node("tradeFromInput").value = "Team 0";
  a.node("tradeToInput").value = "Team 1";
  a.node("tradeAssetsInput").value = "Pick #1";
  a.node("tradeNotesInput").value = notes;
  a.evaluate("saveTrade()");
}

test("trade undo removes only the latest addition once and is re-enabled only by an addition", () => {
  const a = app();
  addTrade(a, "First");
  addTrade(a, "Second");
  addTrade(a, "Third");
  a.evaluate("undoLastTrade(); renderTrades()");
  assert.deepEqual(Array.from(a.state.trades, (trade) => trade.notes), ["First", "Second"]);
  assert.equal(a.node("undoTradeBtn").disabled, true);
  a.evaluate("undoLastTrade()");
  assert.equal(a.state.trades.length, 2);
  a.context.editId = a.state.trades[0].id;
  a.evaluate("editTrade(editId)");
  a.node("tradeNotesInput").value = "Edited";
  a.evaluate("saveTrade(); renderTrades()");
  assert.equal(a.node("undoTradeBtn").disabled, true);
  addTrade(a, "Fourth");
  a.evaluate("renderTrades()");
  assert.equal(a.node("undoTradeBtn").disabled, false);
  a.evaluate("undoLastTrade()");
  assert.deepEqual(Array.from(a.state.trades, (trade) => trade.notes), ["Edited", "Second"]);
});

test("finalize review stages every editable trade and preserves reviewed trades separately from required swaps", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.results = a.evaluate("runLotteryCalculation(() => 0.5)");
  a.state.lastRunMeta = a.evaluate("buildRunMeta('')");
  a.state.lastRunMeta.completed = true;
  a.context.runContext = { year: 2026, odds: [], totalBalls: 20 };
  a.evaluate("saveLotteryToHistory(state.results, runContext)");
  const required = JSON.stringify(a.state.lotteryHistory["2026"].trades);
  addTrade(a, "First");
  addTrade(a, "Second");
  a.evaluate("openFinalizeReview()");
  assert.equal(a.node("finalizeDialog").open, true);
  const review = a.node("finalizeTradeList").children[0];
  review.querySelector(".review-notes").listeners.input({ target: { value: "Reviewed notes" } });
  assert.equal(a.state.trades[0].notes, "First");
  a.node("finalizeTradeList").children[1].querySelector(".review-remove").listeners.click();
  a.evaluate("confirmFinalizeReview()");
  assert.equal(a.state.seasonHistory[0].reviewedTrades.length, 1);
  assert.equal(a.state.seasonHistory[0].reviewedTrades[0].notes, "Reviewed notes");
  assert.equal(a.state.lotteryHistory["2026"].reviewedTrades[0].notes, "Reviewed notes");
  assert.equal(a.state.lotteryHistory["2026"].finalized, true);
  assert.equal(JSON.stringify(a.state.lotteryHistory["2026"].trades), required);
  const b = app(a.storage);
  b.evaluate("restoreStateFromStorage(); restoreHistoryFromStorage()");
  assert.equal(b.state.seasonHistory[0].reviewedTrades[0].notes, "Reviewed notes");
  assert.equal(b.state.lotteryHistory["2026"].reviewedTrades[0].notes, "Reviewed notes");
});

test("finalize review rejects incomplete trades without changing results or history", () => {
  const a = app();
  a.state.results = a.evaluate("runLotteryCalculation(() => 0.5)");
  a.state.lastRunMeta = a.evaluate("buildRunMeta('')");
  addTrade(a, "Notes");
  a.evaluate("openFinalizeReview(); state.finalizeDraft[0].fromTeam = ''; confirmFinalizeReview()");
  assert.equal(a.state.results.length, 8);
  assert.equal(a.state.seasonHistory.length, 0);
  assert.match(a.messages.at(-1), /Every reviewed trade needs both teams/);
});

test("per-flag overrides retain the independent automatic flag, accept empty lists, clear and resync", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.protectionOverrides = { year: 2026, previousNumberOne: ["Team 3"] };
  let protection = a.evaluate("getProtection()");
  assert.equal(protection.teams[0].previousNumberOne, false);
  assert.equal(protection.teams[3].previousNumberOne, true);
  assert.equal(protection.teams[0].previousTopThree, true);
  assert.equal(a.state.teams[3].previousNumberOne, false);
  a.state.protectionOverrides.previousTopThree = [];
  protection = a.evaluate("getProtection()");
  assert.ok(protection.teams.every((team) => !team.previousTopThree));
  a.state.manualProtectionYear = 2026;
  a.evaluate("clearProtectionOverrides()");
  assert.equal(a.state.manualProtectionYear, null);
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), true);
  assert.equal(a.evaluate("getProtection().teams[0].previousTopThree"), true);
  a.state.protectionOverrides = { year: 2025, previousNumberOne: ["Team 3"] };
  assert.equal(a.evaluate("getProtection().teams[0].previousNumberOne"), true);
});

test("missing prior history can be acknowledged independently for each enforced flag", () => {
  const a = app();
  a.state.protectionOverrides = { year: 2026, previousNumberOne: [] };
  assert.equal(a.evaluate("protectionReady()"), false);
  a.node("topThreeCooldownToggle").checked = false;
  assert.equal(a.evaluate("protectionReady()"), true);
  a.node("topThreeCooldownToggle").checked = true;
  a.state.protectionOverrides.previousTopThree = [];
  assert.equal(a.evaluate("protectionReady()"), true);
  a.evaluate("persistState()");
  const b = app(a.storage);
  b.evaluate("restoreStateFromStorage()");
  assert.deepEqual(JSON.parse(JSON.stringify(b.state.protectionOverrides)), {
    year: 2026, previousNumberOne: [], previousTopThree: [],
  });
  assert.equal(b.evaluate("protectionReady()"), true);
});

test("per-flag dialogs initialize from effective flags and save only their own selection", () => {
  const a = app();
  a.node("flagSourcePanel").innerHTML = "<button>Override controls</button>";
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.evaluate("openFlagOverride('previousNumberOne')");
  const checkboxes = a.node("flagOverrideTeams").querySelectorAll("input");
  assert.equal(checkboxes[0].checked, true);
  assert.equal(checkboxes[1].checked, false);
  checkboxes[0].checked = false;
  checkboxes[4].checked = true;
  a.evaluate("saveFlagOverride(); renderFlagAudit()");
  assert.deepEqual(Array.from(a.state.protectionOverrides.previousNumberOne), ["Team 4"]);
  assert.equal(a.state.protectionOverrides.previousTopThree, undefined);
  assert.match(a.node("flagSourceSummary").innerHTML, /Manual Previous #1 override for 2026/);
  assert.match(a.node("flagSourceSummary").innerHTML, /2025 saved history/);
  assert.equal(a.node("flagSourcePanel").innerHTML, "<button>Override controls</button>");
  assert.equal(a.node("flagOverrideDialog").open, false);
  a.evaluate("openFlagOverride('previousTopThree')");
  a.node("flagOverrideTeams").querySelectorAll("input").forEach((checkbox) => { checkbox.checked = false; });
  a.evaluate("saveFlagOverride()");
  assert.equal(a.state.protectionOverrides.previousNumberOne[0], "Team 4");
  assert.equal(a.state.protectionOverrides.previousTopThree.length, 0);
  assert.equal(a.evaluate("getProtection().teams[4].previousNumberOne"), true);
  assert.ok(a.evaluate("getProtection().teams").every((team) => !team.previousTopThree));
});

test("dry runs and exports are isolated from all live fields and localStorage until explicit save", async () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.results = a.evaluate("runLotteryCalculation(() => 0)");
  a.state.lastRunMeta = a.evaluate("buildRunMeta('live')");
  a.state.setupLocked = true;
  addTrade(a, "Live trade");
  a.evaluate("persistState(); persistHistory()");
  const liveSnapshot = a.evaluate("JSON.stringify({teams:state.teams,results:state.results,trades:state.trades,setupLocked:state.setupLocked,lastRunMeta:state.lastRunMeta,lotteryHistory:state.lotteryHistory,seasonHistory:state.seasonHistory,ruleHistory:state.ruleHistory})");
  const storageSnapshot = JSON.stringify([...a.storage]);
  a.node("lotteryPickCount").value = "invalid";
  a.evaluate("createDryRun(() => 0.9)");
  assert.equal(a.node("lotteryPickCount").value, "invalid");
  assert.equal(a.state.dryRun.finalOrder.length, 8);
  assert.match(a.node("dryRunResults").innerHTML, /title="Original slot before the lottery/);
  assert.match(a.node("dryRunResults").innerHTML, /movement-badge/);
  assert.notEqual(JSON.stringify(a.state.dryRun.finalOrder), JSON.stringify(a.state.results));
  await a.evaluate("exportDryRun()");
  assert.equal(a.context.downloads.length, 1);
  const exported = a.context.downloads[0].payload;
  assert.equal(exported.dryRun, true);
  assert.equal((await tools.verifyChecksum(exported)).valid, true);
  assert.equal(a.evaluate("JSON.stringify({teams:state.teams,results:state.results,trades:state.trades,setupLocked:state.setupLocked,lastRunMeta:state.lastRunMeta,lotteryHistory:state.lotteryHistory,seasonHistory:state.seasonHistory,ruleHistory:state.ruleHistory})"), liveSnapshot);
  assert.equal(JSON.stringify([...a.storage]), storageSnapshot);
  a.node("dryRunYearInput").value = "2025";
  a.evaluate("saveDryRun()");
  assert.match(a.messages.at(-1), /valid new year/);
  assert.ok(a.state.dryRun);
  a.node("dryRunYearInput").value = "2028";
  a.evaluate("saveDryRun()");
  assert.equal(a.state.dryRun, null);
  assert.equal(a.state.lotteryHistory["2028"].finalOrder.length, 8);
  assert.equal(a.state.results.length, 8);
  assert.equal(a.state.lastRunMeta.seed, "live");
  assert.equal(a.state.setupLocked, true);
});

test("bracket UI uses power-of-two byes, wrapped seeds, safe labels and exports", () => {
  const a = app();
  a.node("bracketPanel").innerHTML = "<button>Bracket export controls</button>";
  a.state.results = a.evaluate("runLotteryCalculation(() => 0)");
  a.state.results[0].team = "<img src=x>";
  for (const count of [6, 8, 12]) {
    a.node("playoffTeamCount").value = String(count);
    a.evaluate("generateBracket()");
    assert.equal(a.state.bracket.seeds.length, count);
    const size = 2 ** Math.ceil(Math.log2(count));
    assert.equal(a.state.bracket.matches.length, size / 2);
    assert.equal(a.state.bracket.matches.filter((match) => !match.away).length, size - count);
    assert.match(a.node("bracketResults").innerHTML, /&lt;img src=x&gt;/);
    assert.equal(a.node("bracketResults").innerHTML.includes("<img src=x>"), false);
    assert.equal(a.node("bracketPanel").hidden, false);
    assert.equal(a.node("bracketPanel").innerHTML, "<button>Bracket export controls</button>");
    assert.match(a.node("bracketResults").innerHTML, /Seed order/);
    assert.equal((a.node("bracketResults").innerHTML.match(/<li>/g) || []).length, count);
    assert.match(tools.bracketCsv(a.state.bracket), /HomeSeed,HomeTeam/);
  }
  assert.equal(a.state.bracket.seeds[8].team, "<img src=x>");
  a.state.results = [];
  a.evaluate("renderBracket()");
  assert.equal(a.state.bracket, null);
  assert.equal(a.node("exportBracketCsvBtn").disabled, true);
});

test("rule restoration confirms a readable diff and appends a new version without rewriting history", () => {
  const a = app();
  a.evaluate("snapshotRuleVersion('Original')");
  const originalId = a.state.ruleHistory[0].id;
  a.node("lotteryPickCount").value = "4";
  a.evaluate("snapshotRuleVersion('Four picks')");
  a.context.originalId = originalId;
  a.state.results = a.evaluate("runLotteryCalculation(() => 0.5)");
  const existing = JSON.stringify(a.state.ruleHistory);
  a.context.acceptConfirmation = false;
  a.evaluate("restoreRuleVersion(originalId)");
  assert.equal(JSON.stringify(a.state.ruleHistory), existing);
  assert.equal(a.state.results.length, 8);
  a.context.acceptConfirmation = true;
  a.evaluate("restoreRuleVersion(originalId)");
  assert.equal(a.node("lotteryPickCount").value, "8");
  assert.equal(a.state.ruleHistory.length, 3);
  assert.notEqual(a.state.ruleHistory[0].id, originalId);
  assert.equal(a.state.ruleHistory[2].id, originalId);
  assert.match(a.confirmations.at(-1), /Lottery picks: 4 → 8/);
  assert.equal(a.state.results.length, 0);
});

test("recovery preview is read-only and conflicts merge only after explicit approvals", async () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.evaluate("persistHistory()");
  const replacement = history.upsertRecord({}, prior(2025, ["Team 3", "Team 4", "Team 5"]));
  const incoming = history.upsertRecord(replacement, prior(2024));
  a.node("recoveryText").value = JSON.stringify(history.buildHistoryExport(incoming));
  const before = JSON.stringify(a.state.lotteryHistory);
  const storageBefore = JSON.stringify([...a.storage]);
  await a.evaluate("previewRecovery()");
  assert.equal(JSON.stringify(a.state.lotteryHistory), before);
  assert.equal(JSON.stringify([...a.storage]), storageBefore);
  assert.match(a.node("recoveryPreview").innerHTML, /Conflicts: 2025/);
  assert.match(a.node("recoveryPreview").innerHTML, /3 picks, 0 odds entries/);
  a.context.acceptConfirmation = false;
  a.evaluate("mergeRecovery()");
  assert.equal(JSON.stringify(a.state.lotteryHistory), before);
  assert.ok(a.state.recoveryCandidate);
  a.context.acceptConfirmation = true;
  a.evaluate("mergeRecovery()");
  assert.equal(a.state.recoveryCandidate, null);
  assert.equal(a.state.lotteryHistory["2025"].finalOrder[0].team, "Team 3");
  assert.ok(a.state.lotteryHistory["2024"]);
});

test("full-state exports checksum overrides and archive metadata and import them safely", async () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, { ...prior(), archived: true });
  a.state.protectionOverrides = { year: 2026, previousNumberOne: ["Team 4"] };
  await a.evaluate("downloadJson()");
  const exported = a.context.downloads[0].payload;
  assert.equal((await tools.verifyChecksum(exported)).valid, true);
  const b = app();
  b.node("importJsonInput").files = [{ text: async () => JSON.stringify(exported) }];
  await b.evaluate("importJson()");
  assert.equal(b.state.protectionOverrides.previousNumberOne[0], "Team 4");
  assert.equal(b.state.lotteryHistory["2025"].archived, true);
  b.evaluate("renderLotteryHistory()");
  assert.equal(b.node("historyYearSelect").disabled, true);
  b.node("showArchivedToggle").checked = true;
  b.evaluate("renderLotteryHistory()");
  assert.equal(b.node("historyYearSelect").disabled, false);
  assert.match(b.node("historyYearSelect").innerHTML, /2025 \(archived\)/);
  b.evaluate("archiveSelectedHistoryYear()");
  assert.equal(b.state.lotteryHistory["2025"].archived, false);
  assert.equal(b.evaluate("getProtection().teams[0].previousTopThree"), true);
});

test("checksum mismatch warns visibly but does not block an otherwise valid import", async () => {
  const a = app();
  const payload = await tools.withChecksum({ teams: a.state.teams, seasonYear: 2026 });
  payload.teams[0].name = "Tampered";
  a.node("importJsonInput").files = [{ text: async () => JSON.stringify(payload) }];
  a.context.acceptConfirmation = false;
  await a.evaluate("importJson()");
  assert.equal(a.state.teams[0].name, "Tampered");
  assert.ok(a.storage.size > 0);
  assert.equal(a.confirmations.length, 0);
  assert.ok(a.messages.some((message) => /checksum does not match/.test(message)));
  assert.match(a.node("statusText").textContent, /checksum does not match/);
  a.evaluate("renderAuditPanel()");
  assert.match(a.node("auditSummary").innerHTML, /Import integrity warning/);
});

test("tie-break badges explain all applied rules and safely escape tied opponent names", () => {
  const a = app();
  a.state.teams[0].winPct = 0.25;
  a.state.teams[1].winPct = 0.25;
  a.state.teams[2].winPct = 0.25;
  a.state.teams[0].sos = 0.4;
  a.state.teams[1].sos = 0.5;
  a.state.teams[2].sos = 0.4;
  a.state.teams[2].name = 'Team <"2">';
  const entries = a.evaluate("buildLotteryEntries()");
  const first = entries.find((entry) => entry.id === "0");
  assert.deepEqual(Array.from(first.tieBreaks, (entry) => entry.reason).sort(), ["Coin flip", "Strength of Schedule"]);
  a.context.entry = first;
  const badge = a.evaluate("buildTieBreakBadge(entry)");
  assert.match(badge, /Standings tie-break:/);
  assert.match(badge, /original standings slot only, not the lottery draw/);
  assert.match(badge, /Strength of Schedule/);
  assert.match(badge, /Coin flip/);
  assert.match(badge, /Tied with .*; ordering by Strength of Schedule/);
  assert.match(badge, /Team &lt;&quot;2&quot;&gt;/);
  a.evaluate("renderTeams(); renderMobileTeams()");
  assert.match(a.node("teamTableBody").children[0].innerHTML, /tie-break-badge/);
  assert.match(a.node("mobileTeamList").children[0].innerHTML, /tie-break-badge/);
});

test("mobile move controls reorder setup without altering history and respect setup lock", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  const before = JSON.stringify(a.state.lotteryHistory);
  a.evaluate("renderMobileTeams()");
  a.node("mobileTeamList").children[1].querySelector(".mobile-up").listeners.click();
  assert.equal(a.state.teams[0].name, "Team 1");
  assert.equal(JSON.stringify(a.state.lotteryHistory), before);
  a.state.setupLocked = true;
  a.evaluate("renderMobileTeams()");
  a.node("mobileTeamList").children[0].querySelector(".mobile-down").listeners.click();
  assert.equal(a.state.teams[0].name, "Team 1");
  assert.match(a.messages.at(-1), /Unlock setup/);
});

test("undo after a generated batch removes only its final trade and then disables undo", () => {
  const a = app();
  a.state.results = a.evaluate("runLotteryCalculation(() => 0.9)");
  addTrade(a, "Manual trade");
  a.evaluate("generateTradesFromResults()");
  const before = a.state.trades.length;
  assert.ok(before > 2);
  const latestId = a.state.trades.at(-1).id;
  a.evaluate("undoLastTrade(); renderTrades()");
  assert.equal(a.state.trades.length, before - 1);
  assert.equal(a.state.trades.some((trade) => trade.id === latestId), false);
  assert.equal(a.state.trades[0].notes, "Manual trade");
  assert.equal(a.node("undoTradeBtn").disabled, true);
  a.evaluate("undoLastTrade()");
  assert.equal(a.state.trades.length, before - 1);
});

test("dry-run snapshots preserve teams, owners, settings and seed across live edits and cancelled saves", async () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, prior());
  a.state.seedEnabled = true;
  a.state.seedText = "snapshot-seed";
  a.state.teams[0].headToHead = { "Team 1": { wins: 1, losses: 0 } };
  a.evaluate("createDryRun(() => 0.7)");
  const snapshot = JSON.stringify(a.state.dryRun);
  const savedOrder = Array.from(a.state.dryRun.finalOrder, (entry) => ({ team: entry.team, owner: entry.owner }));
  const historyBefore = JSON.stringify(a.state.lotteryHistory);
  a.state.teams[0].name = "Edited live team";
  a.state.teams[0].owner = "Edited live owner";
  a.state.teams[0].headToHead["Team 1"].wins = 5;
  a.state.seedText = "edited-live-seed";
  a.node("lotteryPickCount").value = "4";
  a.node("bottomProtectionToggle").checked = false;
  a.evaluate("renderDryRun()");
  assert.match(a.node("dryRunSnapshotSummary").innerHTML, /snapshot-seed/);
  assert.match(a.node("dryRunSnapshotSummary").innerHTML, /Picks: 8/);
  assert.match(a.node("dryRunSnapshotSummary").innerHTML, /Snapshot year:<\/strong> 2026/);
  assert.match(a.node("dryRunSnapshotSummary").innerHTML, /Snapshot only: later setup changes do not update this preview/);
  assert.doesNotMatch(a.node("dryRunSnapshotSummary").innerHTML, /edited-live-seed/);
  assert.equal(JSON.stringify(a.state.dryRun), snapshot);
  for (const invalid of ["", "bad", "2025", "2026"]) {
    a.node("dryRunYearInput").value = invalid;
    a.evaluate("saveDryRun()");
    assert.equal(JSON.stringify(a.state.dryRun), snapshot);
    assert.equal(JSON.stringify(a.state.lotteryHistory), historyBefore);
  }
  a.node("dryRunYearInput").value = "2028";
  a.context.acceptConfirmation = false;
  a.evaluate("saveDryRun()");
  assert.equal(JSON.stringify(a.state.dryRun), snapshot);
  assert.equal(JSON.stringify(a.state.lotteryHistory), historyBefore);
  await a.evaluate("exportDryRun()");
  assert.equal(a.context.downloads[0].payload.teams[0].name, "Team 0");
  assert.equal(a.context.downloads[0].payload.teams[0].headToHead["Team 1"].wins, 1);
  a.context.acceptConfirmation = true;
  a.evaluate("saveDryRun()");
  const saved = a.state.lotteryHistory["2028"];
  assert.equal(saved.seed, "snapshot-seed");
  assert.equal(saved.settings.lotteryPickCount, 8);
  assert.equal(saved.settings.bottomFourProtection, true);
  assert.equal(saved.source, "dry-run");
  assert.equal(saved.teams[0].name, "Team 0");
  assert.equal(saved.teams[0].headToHead["Team 1"].wins, 1);
  assert.deepEqual(Array.from(saved.finalOrder, (entry) => ({ team: entry.team, owner: entry.owner })), savedOrder);
  assert.equal(a.state.teams[0].name, "Edited live team");
  assert.equal(a.state.teams[0].owner, "Edited live owner");
  assert.equal(a.state.seedText, "edited-live-seed");
  const b = app(a.storage);
  b.evaluate("restoreHistoryFromStorage()");
  assert.equal(b.state.lotteryHistory["2028"].teams[0].name, "Team 0");
  assert.equal(b.state.lotteryHistory["2028"].seed, "snapshot-seed");
});

test("flag audit includes actual prior winners outside active setup and prior provenance", () => {
  const a = app();
  a.state.lotteryHistory = history.upsertRecord({}, {
    ...prior(2025, ["Outside <Team>", "Outside Two", "Outside Three"]), finalized: true,
  });
  a.state.protectionOverrides = { year: 2026, previousNumberOne: ["Team 4"] };
  a.evaluate("renderFlagAudit()");
  const markup = a.node("flagSourceSummary").innerHTML;
  assert.match(markup, /Year: 2025 · finalized:Y · manual:Y/);
  assert.match(markup, /Recorded previous #1:<\/strong> <span>Outside &lt;Team&gt;/);
  assert.match(markup, /Outside &lt;Team&gt;, Outside Two, Outside Three/);
  assert.match(markup, /Team 4 — Manual Previous #1 override for 2026/);
  assert.equal(a.evaluate("getProtection().teams[4].previousTopThree"), false);
});

test("mobile cards provide working name, owner, manual flag and removal controls with lock guards", () => {
  const a = app();
  a.state.manualProtectionYear = 2026;
  a.evaluate("renderMobileTeams()");
  let card = a.node("mobileTeamList").children[0];
  card.querySelector(".mobile-owner").listeners.change({ target: { value: "Team 1" } });
  assert.equal(a.state.teams[0].owner, "Team 1");
  card.querySelector(".mobile-name").listeners.change({ target: { value: "Arizona Cardinals" } });
  assert.equal(a.state.teams[0].name, "Arizona Cardinals");
  assert.equal(a.state.teams[0].owner, "Team 1");
  card.querySelector(".previous-top-three").listeners.change({ target: { checked: true } });
  card.querySelector(".previous-number-one").listeners.change({ target: { checked: true } });
  assert.equal(a.state.teams[0].previousTopThree, true);
  assert.equal(a.state.teams[0].previousNumberOne, true);
  a.state.setupLocked = true;
  a.evaluate("renderMobileTeams()");
  card = a.node("mobileTeamList").children[0];
  assert.match(card.innerHTML, /mobile-name[^>]*disabled/);
  assert.match(card.innerHTML, /mobile-owner[^>]*disabled/);
  card.querySelector(".mobile-remove").listeners.click();
  assert.equal(a.state.teams.length, 8);
  card.querySelector(".mobile-name").listeners.change({ target: { value: "Chicago Bears" } });
  assert.equal(a.state.teams[0].name, "Arizona Cardinals");
  a.state.setupLocked = false;
  a.evaluate("renderMobileTeams()");
  a.node("mobileTeamList").children[0].querySelector(".mobile-remove").listeners.click();
  assert.equal(a.state.teams.length, 7);
  assert.equal(a.state.teams[0].name, "Team 1");
});

test("trade-table clipboard fallback downloads a dated filename", async () => {
  const a = app();
  addTrade(a, "Table export");
  a.context.navigator.clipboard.writeText = async () => { throw new Error("Clipboard blocked"); };
  a.evaluate("downloadTextFile = (name, text) => downloads.push({name, text})");
  await a.evaluate("exportTradesTable()");
  assert.match(a.context.downloads[0].name, /^flockville-trades-\d{4}-\d{2}-\d{2}\.txt$/);
  assert.match(a.context.downloads[0].text, /Table export/);
});

test("rule versions list every snapshot with active ID, captured timestamp and chronological changes", () => {
  const a = app();
  a.evaluate("snapshotRuleVersion('Original')");
  const firstId = a.state.ruleHistory[0].id;
  a.node("lotteryPickCount").value = "6";
  a.evaluate("snapshotRuleVersion('Six picks'); renderRuleHistory(); renderCurrentRules()");
  const items = a.node("ruleHistoryList").children;
  assert.equal(items.length, 2);
  assert.match(items[0].innerHTML, /Active version/);
  assert.ok(items[0].innerHTML.includes(a.state.ruleHistory[0].id));
  assert.ok(items[0].innerHTML.includes(a.state.ruleHistory[0].effectiveAt));
  assert.match(items[0].innerHTML, /Lottery picks: 8 → 6/);
  assert.match(items[0].innerHTML, /restore-rule-btn[^>]*disabled/);
  assert.match(items[1].innerHTML, /Historical version/);
  assert.ok(items[1].innerHTML.includes(firstId));
  assert.match(items[1].innerHTML, /Initial rule snapshot/);
  assert.doesNotMatch(items[1].innerHTML, /restore-rule-btn[^>]*disabled/);
  assert.ok(a.node("currentRulesPanel").innerHTML.includes(a.state.ruleHistory[0].id));
  a.context.firstId = firstId;
  a.evaluate("restoreRuleVersion(firstId)");
  assert.equal(a.state.ruleHistory.length, 3);
  a.evaluate("restoreRuleVersion(firstId)");
  assert.equal(a.state.ruleHistory.length, 4);
  assert.notEqual(a.state.ruleHistory[0].id, a.state.ruleHistory[1].id);
  assert.equal(a.state.ruleHistory[0].settings.lotteryPickCount, 8);
  a.context.activeId = a.state.ruleHistory[0].id;
  a.evaluate("restoreRuleVersion(activeId)");
  assert.equal(a.state.ruleHistory.length, 4);
});

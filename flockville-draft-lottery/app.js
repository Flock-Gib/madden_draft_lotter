const STORAGE_KEY = "flockvilleDraftLotteryState";
const HISTORY_STORAGE_KEY = "flockvilleDraftLotteryHistory";
const STORAGE_VERSION = 3;
const MAX_SEASON_HISTORY = 12;
const MAX_RULE_HISTORY = 50;
const DEFAULT_STATUS = "Add teams, confirm the settings, and start the draw.";
const DEMO_TEAM_COUNT = 8;
const DEMO_TEAM_PRESET = [
  "Raiders", "Giants", "Titans", "Browns",
  "Jets", "Panthers", "Saints", "Patriots",
];

const NFL_TEAMS = [
  "Arizona Cardinals",
  "Atlanta Falcons",
  "Baltimore Ravens",
  "Buffalo Bills",
  "Carolina Panthers",
  "Chicago Bears",
  "Cincinnati Bengals",
  "Cleveland Browns",
  "Dallas Cowboys",
  "Denver Broncos",
  "Detroit Lions",
  "Green Bay Packers",
  "Houston Texans",
  "Indianapolis Colts",
  "Jacksonville Jaguars",
  "Kansas City Chiefs",
  "Las Vegas Raiders",
  "Los Angeles Chargers",
  "Los Angeles Rams",
  "Miami Dolphins",
  "Minnesota Vikings",
  "New England Patriots",
  "New Orleans Saints",
  "New York Giants",
  "New York Jets",
  "Philadelphia Eagles",
  "Pittsburgh Steelers",
  "San Francisco 49ers",
  "Seattle Seahawks",
  "Tampa Bay Buccaneers",
  "Tennessee Titans",
  "Washington Commanders",
];

const state = {
  teams: [],
  results: [],
  trades: [],
  seasonHistory: [],
  ruleHistory: [],
  setupLocked: false,
  seedEnabled: false,
  seedText: "",
  lastRunMeta: null,
  seasonYear: new Date().getFullYear(),
  lotteryHistory: {},
  selectedHistoryYear: "",
  manualProtectionYear: null,
  editingHistoryRecord: null,
  importedSeasonCandidates: [],
  isRunning: false,
  editingTradeId: "",
  undoTradeIds: [],
  protectionOverrides: null,
  editingProtectionFlag: "",
  dryRun: null,
  bracket: null,
  recoveryCandidate: null,
  finalizeDraft: null,
};

const els = {
  teamNameInput: document.getElementById("teamNameInput"),
  pickOwnerInput: document.getElementById("pickOwnerInput"),
  addTeamBtn: document.getElementById("addTeamBtn"),
  loadDemoBtn: document.getElementById("loadDemoBtn"),
  loadAllNflBtn: document.getElementById("loadAllNflBtn"),
  setupLockBtn: document.getElementById("setupLockBtn"),
  resetBtn: document.getElementById("resetBtn"),
  teamTableBody: document.getElementById("teamTableBody"),
  lotteryPickCount: document.getElementById("lotteryPickCount"),
  bottomProtectionToggle: document.getElementById("bottomProtectionToggle"),
  topThreeCooldownToggle: document.getElementById("topThreeCooldownToggle"),
  consecutiveOneToggle: document.getElementById("consecutiveOneToggle"),
  seedEnabledToggle: document.getElementById("seedEnabledToggle"),
  seedInput: document.getElementById("seedInput"),
  startLotteryBtn: document.getElementById("startLotteryBtn"),
  finalizeSeasonBtn: document.getElementById("finalizeSeasonBtn"),
  machineText: document.getElementById("machineText"),
  machineOrb: document.querySelector(".machine-orb"),
  statusText: document.getElementById("statusText"),
  resultsGrid: document.getElementById("resultsGrid"),
  lotteryTransparency: document.getElementById("lotteryTransparency"),
  auditSummary: document.getElementById("auditSummary"),
  seasonHistoryList: document.getElementById("seasonHistoryList"),
  currentRulesPanel: document.getElementById("currentRulesPanel"),
  ruleHistoryList: document.getElementById("ruleHistoryList"),
  tradeFromInput: document.getElementById("tradeFromInput"),
  tradeToInput: document.getElementById("tradeToInput"),
  tradeAssetsInput: document.getElementById("tradeAssetsInput"),
  tradeNotesInput: document.getElementById("tradeNotesInput"),
  saveTradeBtn: document.getElementById("saveTradeBtn"),
  cancelTradeEditBtn: document.getElementById("cancelTradeEditBtn"),
  tradeList: document.getElementById("tradeList"),
  copyTradeDiscordBtn: document.getElementById("copyTradeDiscordBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  importJsonBtn: document.getElementById("importJsonBtn"),
  copyDiscordBtn: document.getElementById("copyDiscordBtn"),
  copyLotteryAnnouncementBtn: document.getElementById("copyLotteryAnnouncementBtn"),
  generateTradesBtn: document.getElementById("generateTradesBtn"),
  copySeasonRecapBtn: document.getElementById("copySeasonRecapBtn"),
  copySeasonHistoryDiscordBtn: document.getElementById("copySeasonHistoryDiscordBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  seasonYearInput: document.getElementById("seasonYearInput"),
  requiredTradesList: document.getElementById("requiredTradesList"),
  flowSteps: document.getElementById("flowSteps"),
  historyYearSelect: document.getElementById("historyYearSelect"),
  historyDetail: document.getElementById("historyDetail"),
  deleteHistoryYearBtn: document.getElementById("deleteHistoryYearBtn"),
  exportHistoryBtn: document.getElementById("exportHistoryBtn"),
  importHistoryInput: document.getElementById("importHistoryInput"),
  importHistoryBtn: document.getElementById("importHistoryBtn"),
};
const lotteryOrder = globalThis.lotteryOrder || {};
const lotteryTrades = globalThis.lotteryTrades;
const lotteryHistory = globalThis.lotteryHistory;
const lotteryTools = globalThis.lotteryTools;
let checksumWarning = "";
[
  "undoTradeBtn", "exportTradesCsvBtn", "exportTradesTableBtn", "finalizeDialog",
  "finalizeTradeList", "confirmFinalizeBtn", "cancelFinalizeBtn", "dryRunBtn",
  "dryRunPanel", "dryRunResults", "dryRunTrades", "dryRunYearInput", "saveDryRunBtn",
  "discardDryRunBtn", "exportDryRunBtn", "generateBracketBtn", "playoffTeamCount",
  "dryRunSnapshotSummary",
  "bracketPanel", "exportBracketCsvBtn", "exportBracketTextBtn", "flagSourcePanel",
  "bracketResults", "flagSourceSummary",
  "overrideNumberOneBtn", "overrideTopThreeBtn", "clearProtectionOverrideBtn",
  "flagOverrideDialog", "flagOverrideTeams", "saveFlagOverrideBtn", "cancelFlagOverrideBtn",
  "mobileTeamList", "showArchivedToggle", "archiveHistoryYearBtn", "recoveryText",
  "recoveryFileInput", "previewRecoveryBtn", "recoveryPreview", "mergeRecoveryBtn",
].forEach((id) => { els[id] = document.getElementById(id); });

// Populate the "Add team" dropdown once from the canonical NFL_TEAMS list
NFL_TEAMS.forEach((name) => {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  els.teamNameInput.appendChild(option);
});

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function getBallCount(index) {
  if (index < 4) return 3;
  if (index < 8) return 2;
  return 1;
}

function clampLotteryPickCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(16, parsed));
}

function normalizeName(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sanitizeTeam(team, fallbackName = "") {
  if (!team || typeof team !== "object") return null;
  const cleanName = normalizeName(team.name) || fallbackName;
  if (!cleanName) return null;
  return {
    id: normalizeName(team.id) || createId(),
    name: cleanName,
    owner: normalizeName(team.owner) || cleanName,
    previousTopThree: Boolean(team.previousTopThree),
    previousNumberOne: Boolean(team.previousNumberOne),
    winPct: toFiniteNumber(team.winPct),
    sos: toFiniteNumber(team.sos),
    headToHead: team.headToHead && typeof team.headToHead === "object" ? team.headToHead : {},
  };
}

function sanitizeTeams(list) {
  if (!Array.isArray(list)) return [];
  const usedNames = new Set();
  const teams = [];

  list.forEach((team) => {
    const safeTeam = sanitizeTeam(team);
    if (!safeTeam) return;
    const key = safeTeam.name.toLowerCase();
    if (usedNames.has(key)) return;
    usedNames.add(key);
    teams.push(safeTeam);
  });

  return teams;
}

function sanitizeResults(results, teams) {
  if (!Array.isArray(results)) return [];
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamsByName = new Map(teams.map((team) => [team.name.toLowerCase(), team]));

  return results
    .map((result, index) => {
      if (!result || typeof result !== "object") return null;
      const pick = Number.parseInt(result.pick, 10);
      const safePick = Number.isFinite(pick) ? pick : index + 1;
      const teamName = normalizeName(result.team);
      const teamById = normalizeName(result.id) ? teamsById.get(result.id) : null;
      const teamByName = teamName ? teamsByName.get(teamName.toLowerCase()) : null;
      const resolvedTeam = teamById || teamByName;
      if (!resolvedTeam) return null;

      return {
        id: resolvedTeam.id,
        team: resolvedTeam.name,
        owner: normalizeName(result.owner) || resolvedTeam.owner,
        standingIndex: Number.isFinite(result.standingIndex) ? result.standingIndex : teams.findIndex((t) => t.id === resolvedTeam.id),
        balls: Number.isFinite(result.balls) ? result.balls : getBallCount(teams.findIndex((t) => t.id === resolvedTeam.id)),
        previousTopThree: Boolean(result.previousTopThree),
        previousNumberOne: Boolean(result.previousNumberOne),
        pick: safePick,
        note: normalizeName(result.note),
        tieBreak: normalizeName(result.tieBreak),
        tieOpponents: Array.isArray(result.tieOpponents) ? result.tieOpponents.map(normalizeName).filter(Boolean) : [],
        tieBreaks: sanitizeTieBreaks(result.tieBreaks),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.pick - b.pick)
    .map((result, index) => ({ ...result, pick: index + 1 }));
}

function sanitizeSeasonHistory(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, MAX_SEASON_HISTORY)
    .map((entry) => {
      const topThree = Array.isArray(entry.topThree)
        ? entry.topThree.map((value) => normalizeName(value)).filter(Boolean).slice(0, 3)
        : [];
      const finalOrder = Array.isArray(entry.finalOrder)
        ? entry.finalOrder
            .map((pick) => ({
              pick: Number.parseInt(pick.pick, 10) || 0,
              team: normalizeName(pick.team),
              owner: normalizeName(pick.owner),
            }))
            .filter((pick) => pick.pick > 0 && pick.team)
            .sort((a, b) => a.pick - b.pick)
        : [];

      return {
        id: normalizeName(entry.id) || createId(),
        year: lotteryHistory.sanitizeYear(entry.year),
        finalizedAt: normalizeName(entry.finalizedAt) || new Date().toISOString(),
        numberOne: normalizeName(entry.numberOne) || (topThree[0] || "Unknown"),
        topThree,
        finalOrder,
        seed: normalizeName(entry.seed),
        ruleVersionId: normalizeName(entry.ruleVersionId),
        runMeta: (entry.runMeta && typeof entry.runMeta === "object") ? entry.runMeta : null,
        reviewedTrades: sanitizeTrades(entry.reviewedTrades),
      };
    });
}

function sanitizeRuleVersion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const s = entry.settings && typeof entry.settings === "object" ? entry.settings : {};
  return {
    id: normalizeName(entry.id) || createId(),
    effectiveAt: normalizeName(entry.effectiveAt) || new Date().toISOString(),
    notes: normalizeName(entry.notes),
    settings: {
      lotteryPickCount: clampLotteryPickCount(s.lotteryPickCount ?? 8),
      bottomFourProtection: s.bottomFourProtection ?? true,
      topThreeCooldown: s.topThreeCooldown ?? true,
      noConsecutiveNumberOne: s.noConsecutiveNumberOne ?? true,
    },
  };
}

function sanitizeRuleHistory(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeRuleVersion).filter(Boolean);
}

function getActiveRuleVersion() {
  return state.ruleHistory.length ? state.ruleHistory[0] : null;
}

function settingsMatchRuleVersion(settings, version) {
  if (!version) return false;
  const vs = version.settings;
  return (
    vs.lotteryPickCount === settings.lotteryPickCount &&
    vs.bottomFourProtection === settings.bottomFourProtection &&
    vs.topThreeCooldown === settings.topThreeCooldown &&
    vs.noConsecutiveNumberOne === settings.noConsecutiveNumberOne
  );
}

function snapshotRuleVersion(notes = "", force = false) {
  const settings = getSettingsFromUi();
  const active = getActiveRuleVersion();
  if (!force && settingsMatchRuleVersion(settings, active)) return;
  state.ruleHistory.unshift({
    id: createId(),
    effectiveAt: new Date().toISOString(),
    notes,
    settings,
  });
  state.ruleHistory = state.ruleHistory.slice(0, MAX_RULE_HISTORY);
}

function normalizeAssets(value) {
  if (Array.isArray(value)) {
    return value.map((asset) => normalizeName(asset)).filter(Boolean);
  }

  return String(value || "")
    .split("\n")
    .map((asset) => normalizeName(asset))
    .filter(Boolean);
}

function sanitizeTrade(trade) {
  if (!trade || typeof trade !== "object") return null;
  const fromTeam = normalizeName(trade.fromTeam || trade.from);
  const toTeam = normalizeName(trade.toTeam || trade.to);
  const assets = normalizeAssets(trade.assets);
  const notes = normalizeName(trade.notes);

  if (!fromTeam || !toTeam) return null;
  if (!assets.length && !notes) return null;

  return {
    id: normalizeName(trade.id) || createId(),
    fromTeam,
    toTeam,
    assets,
    notes,
    createdAt: normalizeName(trade.createdAt) || "",
    source: trade.source === "auto" ? "auto" : "manual",
  };
}

function sanitizeTrades(list) {
  if (!Array.isArray(list)) return [];
  return list.map((trade) => sanitizeTrade(trade)).filter(Boolean);
}

function getSettingsFromUi() {
  return {
    lotteryPickCount: clampLotteryPickCount(els.lotteryPickCount.value),
    bottomFourProtection: Boolean(els.bottomProtectionToggle.checked),
    topThreeCooldown: Boolean(els.topThreeCooldownToggle.checked),
    noConsecutiveNumberOne: Boolean(els.consecutiveOneToggle.checked),
  };
}

function applySettingsToUi(settings = {}) {
  const lotteryPickCount = clampLotteryPickCount(settings.lotteryPickCount ?? settings.lotteryPicks ?? 8);
  els.lotteryPickCount.value = String(lotteryPickCount);
  els.bottomProtectionToggle.checked = settings.bottomFourProtection ?? true;
  els.topThreeCooldownToggle.checked = settings.topThreeCooldown ?? true;
  els.consecutiveOneToggle.checked = settings.noConsecutiveNumberOne ?? true;
}

function sanitizeImportedPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("File does not contain valid JSON object data.");
  }

  const payloadTeams = sanitizeTeams(payload.teams);
  if (!payloadTeams.length && Array.isArray(payload.teams) && payload.teams.length) {
    throw new Error("No valid teams were found in the import file.");
  }

  const settings = {
    lotteryPickCount: clampLotteryPickCount(payload.settings?.lotteryPickCount ?? payload.settings?.lotteryPicks ?? 8),
    bottomFourProtection: payload.settings?.bottomFourProtection ?? true,
    topThreeCooldown: payload.settings?.topThreeCooldown ?? true,
    noConsecutiveNumberOne: payload.settings?.noConsecutiveNumberOne ?? true,
  };

  return {
    teams: payloadTeams,
    results: payload.lastRunMeta?.completed === false ? [] : sanitizeResults(payload.results, payloadTeams),
    trades: sanitizeTrades(payload.trades),
    seasonHistory: sanitizeSeasonHistory(payload.seasonHistory),
    ruleHistory: sanitizeRuleHistory(payload.ruleHistory),
    setupLocked: Boolean(payload.setupLocked),
    seedEnabled: Boolean(payload.seedEnabled),
    seedText: normalizeName(payload.seedText),
    lastRunMeta: payload.lastRunMeta && typeof payload.lastRunMeta === "object" &&
      payload.lastRunMeta.completed !== false ? payload.lastRunMeta : null,
    seasonYear: lotteryHistory.sanitizeYear(payload.seasonYear) ?? new Date().getFullYear(),
    manualProtectionYear: lotteryHistory.sanitizeYear(payload.manualProtectionYear),
    protectionOverrides: sanitizeProtectionOverrides(payload.protectionOverrides),
    lotteryHistory: lotteryHistory.extractHistoryFromPayload(payload),
    settings,
  };
}

function persistState() {
  try {
    const payload = {
      schemaVersion: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      settings: getSettingsFromUi(),
      teams: state.teams,
      results: state.results,
      trades: state.trades,
      seasonHistory: state.seasonHistory,
      ruleHistory: state.ruleHistory,
      setupLocked: state.setupLocked,
      seedEnabled: state.seedEnabled,
      seedText: state.seedText,
      lastRunMeta: state.lastRunMeta,
      seasonYear: state.seasonYear,
      manualProtectionYear: state.manualProtectionYear,
      protectionOverrides: state.protectionOverrides,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write failures.
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(lotteryHistory.buildHistoryExport(state.lotteryHistory)));
  } catch {
    showToast("Could not save lottery history to this browser. Use Export History to back it up.");
  }
}

function restoreHistoryFromStorage() {
  let raw;
  try {
    raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  } catch {
    return;
  }

  if (!raw) return;

  try {
    state.lotteryHistory = lotteryHistory.extractHistoryFromPayload(JSON.parse(raw));
  } catch {
    showToast("Saved lottery history was corrupted and could not be loaded.");
  }
}

function restoreStateFromStorage() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }

  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.schemaVersion && parsed.schemaVersion > STORAGE_VERSION) {
      showToast("Saved data is from a newer app version and was skipped.");
      return;
    }

    const restored = sanitizeImportedPayload(parsed);
    state.teams = restored.teams;
    state.results = restored.results;
    state.trades = restored.trades;
    state.seasonHistory = restored.seasonHistory;
    state.ruleHistory = restored.ruleHistory;
    state.setupLocked = restored.setupLocked;
    state.seedEnabled = restored.seedEnabled;
    state.seedText = restored.seedText;
    state.lastRunMeta = restored.lastRunMeta;
    state.seasonYear = restored.seasonYear;
    state.manualProtectionYear = restored.manualProtectionYear;
    state.protectionOverrides = restored.protectionOverrides;

    applySettingsToUi(restored.settings);
    if (parsed.lastRunMeta?.completed === false) {
      showToast("The previous draw was interrupted. Partial live results were discarded; saved history is unchanged.");
    }
  } catch {
    showToast("Saved data was corrupted. Loaded defaults instead.");
  }
}

function isLocked() {
  return state.setupLocked || state.isRunning;
}

function addTeam(name, owner = "") {
  if (isLocked()) {
    showToast("Unlock setup before editing teams.");
    return;
  }

  const cleanName = normalizeName(name);
  if (!cleanName) return;

  if (state.teams.some((team) => team.name.toLowerCase() === cleanName.toLowerCase())) {
    showToast("That team is already in the lottery.");
    return;
  }

  state.teams.push({
    id: createId(),
    name: cleanName,
    owner: normalizeName(owner) || cleanName,
    previousTopThree: false,
    previousNumberOne: false,
    winPct: null,
    sos: null,
    headToHead: {},
  });

  state.results = [];
  state.lastRunMeta = null;
  render();
}

function removeTeam(id) {
  if (isLocked()) {
    showToast("Unlock setup before editing teams.");
    return;
  }

  state.teams = state.teams.filter((team) => team.id !== id);
  state.results = [];
  state.lastRunMeta = null;
  render();
}

function moveTeam(id, direction) {
  if (isLocked()) {
    showToast("Unlock setup before editing teams.");
    return;
  }

  const index = state.teams.findIndex((team) => team.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.teams.length) return;

  [state.teams[index], state.teams[nextIndex]] = [state.teams[nextIndex], state.teams[index]];
  state.results = [];
  state.lastRunMeta = null;
  render();
}

function updateTeam(id, field, value) {
  if (isLocked()) {
    showToast("Unlock setup before editing teams.");
    return;
  }

  const team = state.teams.find((entry) => entry.id === id);
  if (!team) return;
  team[field] = value;
  state.results = [];
  state.lastRunMeta = null;
  render();
}

function renameTeam(id, value) {
  if (isLocked()) {
    showToast("Unlock setup before editing teams.");
    return false;
  }
  const team = state.teams.find((entry) => entry.id === id);
  if (!team) return false;
  const newName = normalizeName(value) || team.name;
  if (state.teams.some((entry) => entry.id !== id && entry.name.toLowerCase() === newName.toLowerCase())) {
    showToast("That team name already exists.");
    return false;
  }
  const oldName = team.name;
  team.name = newName;
  if (team.owner === oldName) team.owner = newName;
  state.results = [];
  state.lastRunMeta = null;
  render();
  return true;
}

function renderOwnerOptions() {
  const currentValue = els.pickOwnerInput.value;
  const currentTradeFromValue = els.tradeFromInput.value;
  const currentTradeToValue = els.tradeToInput.value;
  els.pickOwnerInput.innerHTML = '<option value="">Pick owned by same team</option>';
  els.tradeFromInput.innerHTML = '<option value="">From team</option>';
  els.tradeToInput.innerHTML = '<option value="">To team</option>';

  const names = new Set();
  [...state.teams.map((team) => team.name), ...state.teams.map((team) => team.owner), ...NFL_TEAMS].forEach((name) => {
    const clean = normalizeName(name);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (names.has(key)) return;
    names.add(key);

    const option = document.createElement("option");
    option.value = clean;
    option.textContent = clean;
    els.pickOwnerInput.appendChild(option);

    const fromOption = document.createElement("option");
    fromOption.value = clean;
    fromOption.textContent = clean;
    els.tradeFromInput.appendChild(fromOption);

    const toOption = document.createElement("option");
    toOption.value = clean;
    toOption.textContent = clean;
    els.tradeToInput.appendChild(toOption);
  });

  if ([...els.pickOwnerInput.options].some((option) => option.value === currentValue)) {
    els.pickOwnerInput.value = currentValue;
  }

  if ([...els.tradeFromInput.options].some((option) => option.value === currentTradeFromValue)) {
    els.tradeFromInput.value = currentTradeFromValue;
  }

  if ([...els.tradeToInput.options].some((option) => option.value === currentTradeToValue)) {
    els.tradeToInput.value = currentTradeToValue;
  }
}

function renderTeams() {
  els.teamTableBody.innerHTML = "";
  const locked = isLocked();

  const protection = getProtection();
  const entriesById = new Map(buildLotteryEntries().map((entry) => [entry.id, entry]));
  protection.teams.forEach((team, index) => {
    const row = document.createElement("tr");
    row.dataset.teamId = team.id;

    row.innerHTML = `
      <td>
        <button class="remove-btn move-up" title="Move up" ${locked ? "disabled" : ""}>↑</button>
        <strong>${index + 1}</strong>
        <button class="remove-btn move-down" title="Move down" ${locked ? "disabled" : ""}>↓</button>
      </td>
      <td><select class="team-name-edit" aria-label="${escapeHtml(team.name)} team name" ${locked ? "disabled" : ""}></select>${buildTieBreakBadge(entriesById.get(team.id) || {})}</td>
      <td><input class="owner-edit" aria-label="${escapeHtml(team.name)} pick owner" value="${escapeHtml(team.owner)}" ${locked ? "disabled" : ""} /></td>
      <td><strong>${getBallCount(index)}</strong></td>
      <td><input aria-label="${escapeHtml(team.name)} previous top three" class="inline-check previous-top-three" type="checkbox" ${team.previousTopThree ? "checked" : ""} ${locked || protection.automatic || hasProtectionOverride("previousTopThree") ? "disabled" : ""} /></td>
      <td><input aria-label="${escapeHtml(team.name)} previous number one" class="inline-check previous-number-one" type="checkbox" ${team.previousNumberOne ? "checked" : ""} ${locked || protection.automatic || hasProtectionOverride("previousNumberOne") ? "disabled" : ""} /></td>
      <td><button class="remove-btn remove-team" ${locked ? "disabled" : ""}>Remove</button></td>
    `;

    const nameSelect = row.querySelector(".team-name-edit");
    NFL_TEAMS.forEach((nflName) => {
      const opt = document.createElement("option");
      opt.value = nflName;
      opt.textContent = nflName;
      nameSelect.appendChild(opt);
    });
    // Backward compat: if the saved name isn't in NFL_TEAMS, add it as a selectable option
    if (!NFL_TEAMS.includes(team.name)) {
      const customOpt = document.createElement("option");
      customOpt.value = team.name;
      customOpt.textContent = team.name;
      nameSelect.insertBefore(customOpt, nameSelect.firstChild);
    }
    nameSelect.value = team.name;

    row.querySelector(".move-up").addEventListener("click", () => moveTeam(team.id, -1));
    row.querySelector(".move-down").addEventListener("click", () => moveTeam(team.id, 1));
    row.querySelector(".remove-team").addEventListener("click", () => removeTeam(team.id));

    row.querySelector(".team-name-edit").addEventListener("change", (event) => {
      if (!renameTeam(team.id, event.target.value)) event.target.value = team.name;
    });

    row.querySelector(".owner-edit").addEventListener("change", (event) => {
      updateTeam(team.id, "owner", normalizeName(event.target.value) || team.name);
    });

    row.querySelector(".previous-top-three").addEventListener("change", (event) => {
      updateTeam(team.id, "previousTopThree", event.target.checked);
    });

    row.querySelector(".previous-number-one").addEventListener("change", (event) => {
      updateTeam(team.id, "previousNumberOne", event.target.checked);
    });

    els.teamTableBody.appendChild(row);
  });
}

function getOriginalSlot(result) {
  const explicit = Number.parseInt(result?.originalSlot, 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Number.isFinite(result?.standingIndex) && result.standingIndex >= 0 ? result.standingIndex + 1 : null;
}

function buildMovementBadge(originalSlot, pick) {
  if (!originalSlot) return "";
  const movement = originalSlot - pick;
  if (movement > 0) {
    return `<span class="movement-badge movement-up" title="Moved up ${movement} spot${movement === 1 ? "" : "s"} from pre-lottery slot #${originalSlot}">▲ ${movement}</span>`;
  }
  if (movement < 0) {
    return `<span class="movement-badge movement-down" title="Moved down ${-movement} spot${movement === -1 ? "" : "s"} from pre-lottery slot #${originalSlot}">▼ ${-movement}</span>`;
  }
  return `<span class="movement-badge movement-none" title="Stayed in pre-lottery slot #${originalSlot}">—</span>`;
}

function renderResults() {
  els.resultsGrid.innerHTML = "";

  if (!state.results.length) {
    els.resultsGrid.innerHTML = '<p class="helper-text results-empty">No results yet. Run the lottery to reveal the draft order here.</p>';
  }

  state.results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const winnerTeam = normalizeName(result.team) || normalizeName(result.name) || "Unknown team";
    const ownerText = result.owner !== winnerTeam ? `Pick owned by ${result.owner}` : "Original team owns pick";
    const originalSlot = getOriginalSlot(result);

    card.innerHTML = `
      <div class="result-pick-row">
        <div class="result-pick">Pick #${result.pick}</div>
        ${buildMovementBadge(originalSlot, result.pick)}
      </div>
      <div class="result-team">${escapeHtml(winnerTeam)}</div>
      <div class="result-owner">${escapeHtml(ownerText)}</div>
      ${originalSlot ? `<div class="result-original" title="Where this team's pick sat in the draft order before the lottery (worst record = #1).">Pre-lottery slot: #${originalSlot}</div>` : ""}
      ${result.note ? `<div class="result-note">${escapeHtml(result.note)}</div>` : ""}
      ${buildTieBreakBadge(result)}
    `;

    els.resultsGrid.appendChild(card);
  });

  renderRequiredTrades();

  const hasResults = state.results.length > 0;
  els.copyDiscordBtn.disabled = !hasResults;
  els.downloadJsonBtn.disabled = !hasResults;
  els.finalizeSeasonBtn.disabled = !hasResults || state.isRunning;
  els.generateTradesBtn.disabled = !hasResults || state.isRunning;
  els.copyLotteryAnnouncementBtn.disabled = !hasResults;
}

function getRequiredTrades(results = state.results) {
  if (!lotteryTrades) return [];
  return lotteryTrades.computeRequiredTrades(results);
}

function buildPickLabel(pick, via) {
  return via ? `Pick #${pick} (originally ${via})` : `Pick #${pick}`;
}

function buildRequiredTradesMarkup(trades, emptyText) {
  if (!trades.length) return `<p class="helper-text">${escapeHtml(emptyText)}</p>`;
  return `
    <ol class="required-trade-list">
      ${trades
        .map(
          (trade) => `
            <li>
              <strong>${escapeHtml(trade.fromTeam)}</strong> sends
              <span class="pick-chip" title="${escapeHtml(buildPickLabel(trade.sendPick, trade.sendPickVia))}">Pick #${trade.sendPick}</span>
              to <strong>${escapeHtml(trade.toTeam)}</strong> for
              <span class="pick-chip" title="${escapeHtml(buildPickLabel(trade.receivePick, trade.receivePickVia))}">Pick #${trade.receivePick}</span>
            </li>
          `
        )
        .join("")}
    </ol>
  `;
}

function renderRequiredTrades() {
  if (!els.requiredTradesList) return;

  if (!state.results.length || state.isRunning) {
    els.requiredTradesList.innerHTML = '<p class="helper-text">Trades appear here once the lottery is complete.</p>';
    return;
  }

  try {
    els.requiredTradesList.innerHTML = buildRequiredTradesMarkup(
      getRequiredTrades(),
      "No trades needed — every pick is already held by the team the lottery assigned it to."
    );
  } catch (error) {
    els.requiredTradesList.innerHTML = `<p class="helper-text">Cannot calculate trades: ${escapeHtml(error.message)}</p>`;
  }
}

function getBallGroupLabel(ballCount) {
  return `${ballCount}-ball tier`;
}

function buildLotteryTransparencyData() {
  const entries = buildLotteryEntries();
  const totalBalls = entries.reduce((sum, entry) => sum + entry.balls, 0);
  const eligibleBalls = entries.filter((entry) => isEligibleForPick(entry, 1, entries))
    .reduce((sum, entry) => sum + entry.balls, 0);
  const grouped = new Map();

  entries.forEach((entry) => {
    const chance = eligibleBalls && isEligibleForPick(entry, 1, entries) ? entry.balls / eligibleBalls : 0;
    entry.percent = chance * 100;
    const key = String(entry.balls);
    const existing = grouped.get(key) || {
      label: getBallGroupLabel(entry.balls),
      balls: 0,
      entries: [],
      percent: 0,
    };

    existing.entries.push({
      slot: entry.standingIndex + 1,
      team: entry.name,
      owner: entry.owner,
      balls: entry.balls,
      percent: chance * 100,
      tieBreaks: entry.tieBreaks,
    });
    existing.balls += entry.balls;
    existing.percent += chance * 100;
    grouped.set(key, existing);
  });

  const totalPercent = entries.reduce((sum, entry) => sum + entry.percent, 0);

  return {
    entries,
    totalBalls,
    eligibleBalls,
    totalPercent,
    groups: [...grouped.values()],
  };
}

function renderLotteryTransparency() {
  const data = buildLotteryTransparencyData();

  if (!data.entries.length) {
    els.lotteryTransparency.innerHTML = '<p class="helper-text">Add teams to see each team\'s weighted odds and lottery ball counts.</p>';
    return;
  }

  const rows = data.groups
    .flatMap((group) => group.entries)
    .sort((a, b) => a.slot - b.slot)
    .map(
      (entry) => `
        <tr>
          <td>#${entry.slot}</td>
          <td>${escapeHtml(entry.team)} ${buildTieBreakBadge(entry)}</td>
          <td>${entry.owner && entry.owner !== entry.team ? escapeHtml(entry.owner) : '<span class="muted-text">Same team</span>'}</td>
          <td>${entry.balls}</td>
          <td>
            <div class="odds-bar" aria-hidden="true"><span style="width: ${Math.min(100, entry.percent).toFixed(1)}%"></span></div>
            ${entry.percent.toFixed(1)}%
          </td>
        </tr>
      `
    )
    .join("");

  const groupSummary = data.groups
    .map((group) => `<div class="audit-row"><strong>${escapeHtml(group.label)}:</strong> <span>${group.entries.length} teams · ${group.balls} balls · ${group.percent.toFixed(1)}%</span></div>`)
    .join("");

  els.lotteryTransparency.innerHTML = `
    <p class="helper-text">Every ball is one weighted entry in the draw. More balls means a higher chance, and all entries are shown below from the same weighting used to run the lottery.</p>
    <div class="table-wrap">
      <table class="odds-table">
        <thead>
          <tr>
            <th title="Draft slot before the lottery (worst record = #1).">Pre-lottery slot</th>
            <th>Team</th>
            <th title="The team that currently owns this pick. It receives whatever pick this entry wins.">Pick owner</th>
            <th title="Lottery balls: 3 for the bottom four, 2 for the next four, 1 for everyone else.">Balls</th>
            <th title="Chance of winning #1 after enabled protections remove ineligible entrants.">Chance (first draw)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="odds-totals">
      ${groupSummary}
      <div class="audit-row"><strong>Total balls:</strong> <span>${data.totalBalls}</span></div>
      <div class="audit-row"><strong>Eligible balls for #1:</strong> <span>${data.eligibleBalls}</span></div>
      <div class="audit-row"><strong>Sum of displayed chances:</strong> <span>${data.totalPercent.toFixed(1)}%</span></div>
    </div>
  `;
}

function formatTime(isoString) {
  if (!isoString) return "Not run yet";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

function renderAuditPanel() {
  const meta = state.lastRunMeta;
  const settings = getSettingsFromUi();
  const totalBalls = state.teams.reduce((sum, _team, index) => sum + getBallCount(index), 0);

  const rows = [
    ["Last run", meta?.timestamp ? formatTime(meta.timestamp) : "Not run yet"],
    ["Lottery picks", String(settings.lotteryPickCount)],
    ["Bottom-four protection", settings.bottomFourProtection ? "ON" : "OFF"],
    ["Top-3 cooldown", settings.topThreeCooldown ? "ON" : "OFF"],
    ["No consecutive #1", settings.noConsecutiveNumberOne ? "ON" : "OFF"],
    ["Seed mode", state.seedEnabled ? "ON" : "OFF"],
    ["Seed", state.seedEnabled ? (state.seedText || "(empty)") : "N/A"],
    ["Team count", String(state.teams.length)],
    ["Total balls", String(totalBalls)],
  ];
  if (checksumWarning) rows.push(["Import integrity warning", checksumWarning]);

  els.auditSummary.innerHTML = rows
    .map(([label, value]) => `<div class="audit-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(value)}</span></div>`)
    .join("");
}

function renderSeasonHistory() {
  els.seasonHistoryList.innerHTML = "";

  if (!state.seasonHistory.length) {
    els.seasonHistoryList.innerHTML = '<p class="helper-text">No finalized seasons yet.</p>';
    els.copySeasonRecapBtn.disabled = true;
    els.copySeasonHistoryDiscordBtn.disabled = true;
    return;
  }

  state.seasonHistory.forEach((season, idx) => {
    const item = document.createElement("article");
    item.className = "history-item";

    const ruleVersion = state.ruleHistory.find((v) => v.id === season.ruleVersionId);
    const ruleInfo = ruleVersion
      ? `Picks: ${ruleVersion.settings.lotteryPickCount} · Bottom-4: ${ruleVersion.settings.bottomFourProtection ? "ON" : "OFF"} · Top-3 CD: ${ruleVersion.settings.topThreeCooldown ? "ON" : "OFF"} · No Consec. #1: ${ruleVersion.settings.noConsecutiveNumberOne ? "ON" : "OFF"}`
      : "Rule version not recorded";

    const finalOrderItems = (season.finalOrder || [])
      .map((pick) => {
        const ownerNote = pick.owner && pick.owner !== pick.team ? ` (${escapeHtml(pick.owner)})` : "";
        return `<li>Pick #${pick.pick}: ${escapeHtml(pick.team)}${ownerNote}</li>`;
      })
      .join("");

    item.innerHTML = `
      <div class="history-item-head">
        <p class="history-item-title">${season.year ? `${season.year} season · ` : ""}${escapeHtml(formatTime(season.finalizedAt))}</p>
        <button class="button secondary copy-season-btn" data-season-idx="${idx}">Copy Announcement</button>
      </div>
      <p class="history-item-line"><strong>#1:</strong> ${escapeHtml(season.numberOne || "Unknown")}</p>
      <p class="history-item-line"><strong>Top 3:</strong> ${escapeHtml((season.topThree || []).join(", ") || "N/A")}</p>
      <p class="history-item-line history-rules-ref"><strong>Rules:</strong> ${escapeHtml(ruleInfo)}</p>
      ${finalOrderItems ? `
        <details class="history-details">
          <summary>Full draw order</summary>
          <ol class="history-order-list">${finalOrderItems}</ol>
        </details>
      ` : ""}
    `;

    item.querySelector(".copy-season-btn").addEventListener("click", () => copySingleSeasonDiscord(idx));
    els.seasonHistoryList.appendChild(item);
  });

  els.copySeasonRecapBtn.disabled = false;
  els.copySeasonHistoryDiscordBtn.disabled = false;
}

function formatRuleSettings(settings) {
  return `Picks: ${settings.lotteryPickCount} · Bottom-4: ${settings.bottomFourProtection ? "ON" : "OFF"} · Top-3 CD: ${settings.topThreeCooldown ? "ON" : "OFF"} · No Consec. #1: ${settings.noConsecutiveNumberOne ? "ON" : "OFF"}`;
}

function buildHistoryDetailMarkup(record) {
  const orderRows = record.finalOrder
    .map(
      (pick) => `
        <tr>
          <td><strong>#${pick.pick}</strong></td>
          <td>${escapeHtml(pick.team)}</td>
          <td>${pick.owner && pick.owner !== pick.team ? escapeHtml(pick.owner) : '<span class="muted-text">Same team</span>'}</td>
          <td title="Original slot in the pre-lottery draft order (worst record is #1).">${pick.originalSlot ? `#${pick.originalSlot}` : "—"}</td>
          <td>${buildMovementBadge(pick.originalSlot, pick.pick) || "—"}</td>
        </tr>
      `
    )
    .join("");

  const oddsRows = record.odds
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(
      (entry) => `
        <tr>
          <td>${entry.slot ? `#${entry.slot}` : "—"}</td>
          <td>${escapeHtml(entry.team)}</td>
          <td>${entry.owner && entry.owner !== entry.team ? escapeHtml(entry.owner) : '<span class="muted-text">Same team</span>'}</td>
          <td>${entry.balls ?? "Unknown"}</td>
          <td>${entry.percent === null ? "Unknown" : `${entry.percent.toFixed(1)}%`}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div class="audit-summary">
      <div class="audit-row"><strong>Season:</strong> <span>${record.year}</span></div>
      <div class="audit-row"><strong>Source:</strong> <span>${record.source === "manual" ? "Manually entered / corrected" : record.source === "dry-run" ? "Saved dry-run simulation" : "Saved draw"} · ${record.completeness === "top-three" ? "Partial top-three only" : "Complete order"}</span></div>
      <div class="audit-row"><strong>Lottery run:</strong> <span>${record.runAt ? escapeHtml(formatTime(record.runAt)) : "Unknown — not rerun"}</span></div>
      <div class="audit-row"><strong>#1 pick:</strong> <span>${escapeHtml(record.finalOrder[0]?.team || "Unknown")}</span></div>
      <div class="audit-row"><strong>Rules:</strong> <span>${record.settings ? escapeHtml(formatRuleSettings(record.settings)) : "Unknown"}</span></div>
      ${record.seed ? `<div class="audit-row"><strong>Seed:</strong> <span>${escapeHtml(record.seed)}</span></div>` : ""}
    </div>
    <h3 class="subheading">Final draft order</h3>
    <div class="table-wrap">
      <table class="odds-table">
        <thead>
          <tr><th>Pick</th><th>Team</th><th title="The team that owned this pick when the draw was saved.">Pick owner</th><th title="Original slot in the draft order before the lottery (worst record is #1).">Pre-lottery slot</th><th title="Places gained or lost compared with the original pre-lottery slot.">Movement</th></tr>
        </thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
    <h3 class="subheading">Required trades (${record.trades.length})</h3>
    ${record.source === "manual" || record.completeness === "top-three"
      ? '<p class="helper-text">Trades are not generated from transcribed history. Original standings / trade execution are not established.</p>'
      : buildRequiredTradesMarkup(record.trades, "No trades were needed for this lottery.")}
    ${Array.isArray(record.reviewedTrades) ? `
      <h3 class="subheading">Reviewed trade log (${record.reviewedTrades.length})</h3>
      <pre class="trade-table">${escapeHtml(lotteryTools.tradesTable(record.reviewedTrades))}</pre>` : ""}
    ${oddsRows ? `
      <details class="history-details">
        <summary>Odds used (${record.totalBalls} total balls)</summary>
        <div class="table-wrap">
          <table class="odds-table">
            <thead>
              <tr><th title="Original slot before the lottery (worst record is #1).">Pre-lottery slot</th><th>Team</th><th title="The team that owned this pick when the draw was saved.">Pick owner</th><th title="Each ball is one weighted chance in the lottery.">Balls</th><th title="Chance of winning #1 after protections remove ineligible teams.">Chance (first draw)</th></tr>
            </thead>
            <tbody>${oddsRows}</tbody>
          </table>
        </div>
      </details>
    ` : ""}
  `;
}

function renderLotteryHistory() {
  const years = lotteryHistory.getSortedYears(state.lotteryHistory)
    .filter((year) => els.showArchivedToggle?.checked || !state.lotteryHistory[String(year)].archived).map(String);
  if (!years.includes(state.selectedHistoryYear)) {
    state.selectedHistoryYear = years[0] || "";
  }

  els.historyYearSelect.innerHTML = years.length
    ? years.map((year) => `<option value="${year}">${year}${state.lotteryHistory[year].archived ? " (archived)" : ""}</option>`).join("")
    : '<option value="">No saved lotteries</option>';
  els.historyYearSelect.value = state.selectedHistoryYear;
  els.historyYearSelect.disabled = !years.length;
  els.deleteHistoryYearBtn.disabled = !years.length || state.isRunning;
  els.exportHistoryBtn.disabled = !Object.keys(state.lotteryHistory).length;
  els.importHistoryBtn.disabled = state.isRunning;
  els.importHistoryInput.disabled = state.isRunning;

  const record = state.lotteryHistory[state.selectedHistoryYear];
  if (els.archiveHistoryYearBtn) {
    els.archiveHistoryYearBtn.disabled = !record || state.isRunning;
    els.archiveHistoryYearBtn.textContent = record?.archived ? "Unarchive Year" : "Archive Year";
  }
  els.historyDetail.innerHTML = record
    ? buildHistoryDetailMarkup(record)
    : '<p class="helper-text">No lotteries saved yet. Every completed lottery is saved here automatically under its season year.</p>';
  document.getElementById("editHistoryBtn").disabled = !record || state.isRunning;
  ["newHistoryBtn", "addHistoryPickBtn", "saveManualHistoryBtn", "loadLegacySeasonBtn"].forEach((id) => {
    document.getElementById(id).disabled = state.isRunning;
  });
  const candidates = getLegacyCandidates();
  document.getElementById("legacySeasonSelect").innerHTML = candidates.length
    ? candidates.map((season, index) => `<option value="${index}">${season.year || "Unassigned year"} · ${escapeHtml(formatTime(season.finalizedAt))} · ${escapeHtml(season.numberOne)}</option>`).join("")
    : '<option value="">No older finalized orders</option>';
  document.getElementById("loadLegacySeasonBtn").disabled = !candidates.length || state.isRunning;
}

function sanitizeProtectionOverrides(value) {
  if (!value || typeof value !== "object") return null;
  const year = lotteryHistory.sanitizeYear(value.year);
  if (year === null) return null;
  const result = { year };
  ["previousNumberOne", "previousTopThree"].forEach((flag) => {
    if (Array.isArray(value[flag])) {
      result[flag] = [...new Set(value[flag].map(normalizeName).filter(Boolean))];
    }
  });
  return Object.keys(result).length > 1 ? result : null;
}

function hasProtectionOverride(flag) {
  return state.protectionOverrides?.year === state.seasonYear &&
    Array.isArray(state.protectionOverrides[flag]);
}

/** Overlay each flag independently so an explicit empty selection does not erase the other source. */
function getProtection() {
  const protection = lotteryHistory.deriveProtection(state.teams, state.lotteryHistory, state.seasonYear,
    state.manualProtectionYear === state.seasonYear);
  return { ...protection, teams: protection.teams.map((team) => {
    const copy = { ...team };
    ["previousNumberOne", "previousTopThree"].forEach((flag) => {
      if (hasProtectionOverride(flag)) {
        copy[flag] = state.protectionOverrides[flag].some((name) => name.toLowerCase() === team.name.toLowerCase());
      }
    });
    return copy;
  }) };
}

function protectionReady(year = state.seasonYear) {
  if (year !== state.seasonYear) return false;
  const protection = getProtection();
  return (!els.topThreeCooldownToggle.checked || protection.automatic ||
      state.manualProtectionYear === year || hasProtectionOverride("previousTopThree")) &&
    (!els.consecutiveOneToggle.checked || protection.automatic ||
      state.manualProtectionYear === year || hasProtectionOverride("previousNumberOne"));
}

function renderProtection() {
  const { automatic, priorYear, record } = getProtection();
  const manual = state.manualProtectionYear === state.seasonYear;
  const source = document.getElementById("protectionSource");
  source.textContent = automatic
    ? `Automatic protections from ${priorYear}${record.completeness === "top-three" ? " (partial top-three record)" : ""}: Top 3 — ${record.finalOrder.filter((pick) => pick.pick <= 3).map((pick) => pick.team).join(", ")}; #1 — ${record.finalOrder[0].team}. Toggles independently control enforcement.`
    : manual
      ? `Manual flags enabled for ${state.seasonYear}. Review both checkbox columns; saved ${priorYear} history is overridden.`
      : `Warning: no usable ${priorYear} history for ${state.seasonYear}. Automatic protection is unavailable. Enter that season's order or explicitly enable manual flags (including confirming none).`;
  const toggle = document.getElementById("manualProtectionToggle");
  toggle.checked = manual;
  toggle.disabled = isLocked();
  renderFlagAudit();
}

function getLegacyCandidates() {
  return [...state.seasonHistory, ...state.importedSeasonCandidates];
}

function addHistoryRow(pick = {}) {
  const container = document.getElementById("manualHistoryRows");
  const row = document.createElement("div");
  row.className = "manual-history-row";
  row.innerHTML = `
    <label>Pick <input class="history-pick" type="number" min="1" step="1" value="${escapeHtml(pick.pick ?? container.children.length + 1)}" /></label>
    <label>Original team <input class="history-team" list="historyTeamNames" value="${escapeHtml(pick.team || "")}" /></label>
    <label>Owner (optional) <input class="history-owner" list="historyTeamNames" value="${escapeHtml(pick.owner || "")}" /></label>
    <button class="button secondary" type="button">Remove Pick</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

function openHistoryEditor(record = null) {
  if (state.isRunning) return;
  state.editingHistoryRecord = record;
  document.getElementById("manualHistoryEditor").open = true;
  document.getElementById("manualHistoryYear").value = record?.year || "";
  document.getElementById("manualHistoryCompleteness").value = record?.completeness || "complete";
  document.getElementById("manualHistoryRows").innerHTML = "";
  document.getElementById("manualHistoryMessage").textContent = "";
  document.getElementById("historyTeamNames").innerHTML = [...new Set([...NFL_TEAMS, ...state.teams.map((team) => team.name)])]
    .map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  (record?.finalOrder || [{ pick: 1 }, { pick: 2 }, { pick: 3 }]).forEach(addHistoryRow);
  document.getElementById("manualHistoryYear").focus();
}

function saveManualHistory() {
  if (state.isRunning) return;
  const message = document.getElementById("manualHistoryMessage");
  try {
    const year = document.getElementById("manualHistoryYear").value;
    const finalOrder = [...document.querySelectorAll(".manual-history-row")].map((row) => ({
      pick: row.querySelector(".history-pick").value,
      team: row.querySelector(".history-team").value,
      owner: row.querySelector(".history-owner").value,
    }));
    const existing = state.editingHistoryRecord
      ? { ...state.editingHistoryRecord, year: Number(year) } : null;
    const record = lotteryHistory.createManualRecord({
      year, finalOrder, completeness: document.getElementById("manualHistoryCompleteness").value,
    }, existing);
    const replacing = Boolean(state.lotteryHistory[String(record.year)]);
    if (!confirm(`${replacing ? "Replace the existing" : "Save the actual"} ${record.year} ${record.completeness === "top-three" ? "partial top-three" : "complete"} order? Check it against your source. Other years and live results are unchanged.`)) return;
    state.lotteryHistory = lotteryHistory.upsertRecord(state.lotteryHistory, record);
    state.selectedHistoryYear = String(record.year);
    persistHistory();
    state.editingHistoryRecord = record;
    message.textContent = `Saved ${record.year} as manually entered history. Export History for a backup.`;
    render();
  } catch (error) {
    message.textContent = error.message;
  }
}

function getCurrentStep() {
  if (state.teams.length < 2) return 1;
  if (state.isRunning) return 3;
  if (state.results.length) return 6;
  return state.setupLocked ? 3 : 2;
}

function renderSteps() {
  if (!els.flowSteps) return;
  const current = getCurrentStep();
  [...els.flowSteps.querySelectorAll("[data-step]")].forEach((item) => {
    const step = Number(item.dataset.step);
    item.classList.toggle("is-done", step < current);
    item.classList.toggle("is-current", step === current);
    if (step === current) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function renderCurrentRules() {
  const active = getActiveRuleVersion();
  if (!active) {
    els.currentRulesPanel.innerHTML = '<p class="helper-text">No rules captured yet.</p>';
    return;
  }
  const { settings, effectiveAt } = active;
  const rows = [
    ["Lottery picks", String(settings.lotteryPickCount)],
    ["Bottom-four protection", settings.bottomFourProtection ? "ON" : "OFF"],
    ["Top-3 cooldown", settings.topThreeCooldown ? "ON" : "OFF"],
    ["No consecutive #1", settings.noConsecutiveNumberOne ? "ON" : "OFF"],
  ];
  els.currentRulesPanel.innerHTML = `
    <p class="helper-text"><strong>Active version:</strong> <code class="rule-version-id">${escapeHtml(active.id)}</code></p>
    <p class="helper-text rules-effective-date">In effect since ${escapeHtml(formatTime(effectiveAt))}</p>
    ${rows.map(([label, value]) => `<div class="audit-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(value)}</span></div>`).join("")}
  `;
}

function renderRuleHistory() {
  els.ruleHistoryList.innerHTML = "";

  if (!state.ruleHistory.length) {
    els.ruleHistoryList.innerHTML = '<p class="helper-text">No rule versions captured yet.</p>';
    return;
  }

  state.ruleHistory.forEach((version, index) => {
    const previous = state.ruleHistory[index + 1];
    const active = index === 0;
    const changes = previous ? lotteryTools?.ruleChanges(previous.settings, version.settings) || [] : [];
    const { settings } = version;
    const item = document.createElement("article");
    item.className = "history-item";

    item.innerHTML = `
      <p class="history-item-title"><span class="rule-version-badge">${active ? "Active" : "Historical"} version</span>
        <code class="rule-version-id">${escapeHtml(version.id)}</code></p>
      <p class="history-item-line">Captured <time datetime="${escapeHtml(version.effectiveAt)}">${escapeHtml(formatTime(version.effectiveAt))}</time></p>
      ${version.notes ? `<p class="history-item-line"><em>${escapeHtml(version.notes)}</em></p>` : ""}
      <p class="history-item-line">Picks: ${settings.lotteryPickCount} · Bottom-4: ${settings.bottomFourProtection ? "ON" : "OFF"} · Top-3 CD: ${settings.topThreeCooldown ? "ON" : "OFF"} · No Consec. #1: ${settings.noConsecutiveNumberOne ? "ON" : "OFF"}</p>
      <p class="history-item-line">${changes.length ? changes.map((change) => escapeHtml(change.replace(/\bOn\b/g, "ON").replace(/\bOff\b/g, "OFF"))).join("<br>") : previous ? "No settings changed from the preceding snapshot." : "Initial rule snapshot."}</p>
      <button class="button secondary restore-rule-btn" data-rule-id="${escapeHtml(version.id)}" ${active || isLocked() ? "disabled" : ""}>Restore this version</button>
    `;

    item.querySelector(".restore-rule-btn").addEventListener("click", () => restoreRuleVersion(version.id));
    els.ruleHistoryList.appendChild(item);
  });
}

function renderLockState() {
  const locked = isLocked();

  els.teamNameInput.disabled = locked;
  els.pickOwnerInput.disabled = locked;
  els.addTeamBtn.disabled = locked;
  els.loadDemoBtn.disabled = locked;
  els.loadAllNflBtn.disabled = locked;
  els.importJsonInput.disabled = locked;
  els.importJsonBtn.disabled = locked;

  els.lotteryPickCount.disabled = locked;
  els.bottomProtectionToggle.disabled = locked;
  els.topThreeCooldownToggle.disabled = locked;
  els.consecutiveOneToggle.disabled = locked;
  els.seedEnabledToggle.disabled = locked;
  els.seedInput.disabled = locked || !state.seedEnabled;
  els.seasonYearInput.disabled = state.isRunning;

  els.startLotteryBtn.disabled = state.isRunning || state.teams.length < 2;
  els.resetBtn.disabled = state.isRunning;
  if (els.dryRunBtn) els.dryRunBtn.disabled = state.isRunning || state.teams.length < 2;
  if (els.generateBracketBtn) els.generateBracketBtn.disabled = !state.results.length || state.isRunning;

  if (state.isRunning) {
    els.setupLockBtn.textContent = "Lottery Running";
    els.setupLockBtn.disabled = true;
  } else {
    els.setupLockBtn.textContent = state.setupLocked ? "Unlock Setup" : "Lock Setup";
    els.setupLockBtn.disabled = false;
  }
}

function render() {
  els.seedEnabledToggle.checked = state.seedEnabled;
  els.seedInput.value = state.seedText;
  els.seasonYearInput.value = String(state.seasonYear);
  renderOwnerOptions();
  renderTeams();
  renderProtection();
  renderResults();
  renderLotteryTransparency();
  renderAuditPanel();
  renderSeasonHistory();
  renderLotteryHistory();
  renderSteps();
  renderCurrentRules();
  renderRuleHistory();
  renderTrades();
  renderLockState();
  renderMobileTeams();
  renderDryRun();
  renderBracket();
  persistState();
}

function weightedRandomTeam(eligibleTeams, randomFn) {
  const weightedPool = [];

  eligibleTeams.forEach((entry) => {
    for (let i = 0; i < entry.balls; i += 1) {
      weightedPool.push(entry);
    }
  });

  if (!weightedPool.length) return null;
  return weightedPool[Math.floor(randomFn() * weightedPool.length)];
}

function orderLotteryEntries(entries, context = {}) {
  if (typeof lotteryOrder.orderLotteryEntries === "function") {
    return lotteryOrder.orderLotteryEntries(entries, context);
  }
  return [...entries].sort((a, b) => (a.standingIndex ?? 0) - (b.standingIndex ?? 0));
}

function buildLotteryEntries() {
  const entries = getProtection().teams.map((team, index) => ({
    ...team,
    standingIndex: index,
  }));

  const ordered = orderLotteryEntries(entries, {
    seed: state.seedEnabled ? state.seedText : "",
  });
  const descriptions = typeof lotteryOrder.describeTieBreaks === "function"
    ? lotteryOrder.describeTieBreaks(entries, { seed: state.seedEnabled ? state.seedText : "" }) : [];

  return ordered.map((team, index) => ({
    ...team,
    standingIndex: index,
    balls: getBallCount(index),
    tieBreak: descriptions.find((entry) => entry.id === team.id)?.reason || "",
    tieOpponents: descriptions.find((entry) => entry.id === team.id)?.opponents || [],
    tieBreaks: descriptions.filter((entry) => entry.id === team.id),
  }));
}

function isEligibleForPick(entry, pick, remainingEntries) {
  const topThreeCooldown = els.topThreeCooldownToggle.checked;
  const noConsecutiveOne = els.consecutiveOneToggle.checked;

  if (pick === 1 && noConsecutiveOne && entry.previousNumberOne) {
    return false;
  }

  if (pick <= 3 && topThreeCooldown && entry.previousTopThree) {
    return false;
  }

  return true;
}

function applyBottomFourProtection(results, allEntries) {
  if (!els.bottomProtectionToggle.checked) return results;

  const protectedIds = new Set(allEntries.slice(0, 4).map((team) => team.id));
  const maxProtectedPick = Math.min(8, results.length);

  const top = results.slice(0, maxProtectedPick);
  const rest = results.slice(maxProtectedPick);

  const protectedInRest = rest.filter((r) => protectedIds.has(r.id));

  if (protectedInRest.length === 0) return results;

  const adjusted = [...results];
  protectedInRest.forEach((entry) => {
    const destination = adjusted.findLastIndex((result, index) =>
      index >= 3 && index < maxProtectedPick && !protectedIds.has(result.id));
    const source = adjusted.findIndex((result) => result.id === entry.id);
    if (destination < 0) throw new Error("Bottom-four protection cannot be satisfied.");
    [adjusted[destination], adjusted[source]] = [adjusted[source], adjusted[destination]];
    entry.note = "Moved into protected range by Bottom-Four Protection.";
  });

  return adjusted;
}

function hashSeed(seedText) {
  let hash = 2166136261;
  const input = normalizeName(seedText) || "flockville";
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let stateNumber = hashSeed(seedText);
  return () => {
    stateNumber += 0x6d2b79f5;
    let t = stateNumber;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getRandomSource() {
  if (!state.seedEnabled) {
    return { randomFn: Math.random, seedUsed: "" };
  }

  const seedValue = normalizeName(state.seedText);
  return { randomFn: createSeededRandom(seedValue), seedUsed: seedValue || "(empty seed)" };
}

function runLotteryCalculation(randomFn) {
  const entries = buildLotteryEntries();
  const safeRequested = clampLotteryPickCount(els.lotteryPickCount.value);

  const lotteryCount = Math.min(safeRequested, entries.length);
  const remaining = [...entries];
  const selected = [];

  for (let pick = 1; pick <= lotteryCount; pick += 1) {
    const eligible = remaining.filter((entry) => isEligibleForPick(entry, pick, remaining));
    const winner = weightedRandomTeam(eligible, randomFn);
    if (!winner) throw new Error(`No eligible team for Pick #${pick}. Review protection flags or disable the relevant rule explicitly.`);

    let note = "";
    if (pick === 4 && winner.previousTopThree && els.topThreeCooldownToggle.checked) {
      note = "Top-3 cooldown applied.";
    }

    selected.push({ ...winner, team: winner.name, pick, note });
    remaining.splice(remaining.findIndex((entry) => entry.id === winner.id), 1);
  }

  const orderedRemaining = orderLotteryEntries(remaining, {
    seed: state.seedEnabled ? state.seedText : "",
  });
  while (orderedRemaining.length) {
    const pick = selected.length + 1;
    const index = orderedRemaining.findIndex((entry) => isEligibleForPick(entry, pick, orderedRemaining));
    if (index < 0) throw new Error(`No eligible team for Pick #${pick}. Review protection flags or disable the relevant rule explicitly.`);
    const [entry] = orderedRemaining.splice(index, 1);
    selected.push({
      ...entry,
      team: entry.name,
      pick: selected.length + 1,
      note: "Placed by reverse regular-season record.",
    });
  }

  const adjusted = applyBottomFourProtection(selected, entries);

  adjusted.forEach((result, index) => {
    result.pick = index + 1;
  });

  return adjusted;
}

function buildRunMeta(seedUsed = "") {
  const settings = getSettingsFromUi();
  return {
    timestamp: new Date().toISOString(),
    year: state.seasonYear,
    completed: false,
    lotteryPickCount: settings.lotteryPickCount,
    toggles: {
      bottomFourProtection: settings.bottomFourProtection,
      topThreeCooldown: settings.topThreeCooldown,
      noConsecutiveNumberOne: settings.noConsecutiveNumberOne,
    },
    teamCount: state.teams.length,
    totalBalls: state.teams.reduce((sum, _team, index) => sum + getBallCount(index), 0),
    seedEnabled: state.seedEnabled,
    seed: seedUsed,
  };
}

function buildHistoryRecord(results, runContext) {
  return {
    year: runContext.year,
    runAt: state.lastRunMeta?.timestamp || new Date().toISOString(),
    savedAt: new Date().toISOString(),
    finalOrder: results.map((result) => ({
      pick: result.pick,
      team: result.team,
      owner: result.owner,
      originalSlot: getOriginalSlot(result),
      balls: result.balls,
      note: result.note,
    })),
    odds: runContext.odds,
    totalBalls: runContext.totalBalls,
    trades: getRequiredTrades(results),
    settings: getSettingsFromUi(),
    seed: state.lastRunMeta?.seedEnabled ? state.lastRunMeta.seed : "",
    ruleVersionId: getActiveRuleVersion()?.id || "",
  };
}

function saveLotteryToHistory(results, runContext) {
  state.lotteryHistory = lotteryHistory.upsertRecord(state.lotteryHistory, buildHistoryRecord(results, runContext));
  state.selectedHistoryYear = String(runContext.year);
  persistHistory();
}

async function animateLottery(results, runContext) {
  state.isRunning = true;
  state.results = [];
  render();

  els.machineOrb.classList.add("spinning");

  for (const result of results) {
    els.statusText.textContent = `Drawing Pick #${result.pick}...`;

    const names = state.teams.map((team) => team.name);
    for (let i = 0; i < 14; i += 1) {
      els.machineText.textContent = names[Math.floor(Math.random() * names.length)] || "...";
      await wait(75 + i * 7);
    }

    els.machineText.textContent = result.team;
    state.results.push(result);
    renderResults();
    persistState();
    await wait(700);
  }

  els.machineOrb.classList.remove("spinning");
  els.machineText.textContent = "COMPLETE";
  state.lastRunMeta.completed = true;
  saveLotteryToHistory(results, runContext);
  els.statusText.textContent = `The Flockville Draft Lottery is complete. Results and trades were saved to history for ${runContext.year}.`;
  state.isRunning = false;
  render();
}

function startLottery() {
  if (state.isRunning) return;

  if (state.teams.length < 2) {
    showToast("Add at least two teams before running the lottery.");
    return;
  }

  const safePickCount = clampLotteryPickCount(els.lotteryPickCount.value);
  if (String(safePickCount) !== els.lotteryPickCount.value) {
    els.lotteryPickCount.value = String(safePickCount);
    showToast("Lottery pick count was adjusted to a valid value.");
  }

  const year = lotteryHistory.sanitizeYear(els.seasonYearInput.value);
  if (year === null) {
    showToast("Enter a valid season year (e.g. 2026) before running the lottery.");
    els.seasonYearInput.focus();
    return;
  }
  state.seasonYear = year;
  const protection = getProtection();
  if (!protectionReady(year)) {
    render();
    showToast(`Missing ${year - 1} history. Save that order or explicitly enable and review manual protection flags.`);
    return;
  }

  if (state.lotteryHistory[String(year)]) {
    const replace = confirm(
      `A lottery for ${year} is already saved in history. Running again will replace the saved ${year} results and trades when the draw finishes. Continue?`
    );
    if (!replace) return;
  }

  const odds = buildLotteryTransparencyData();
  const runContext = {
    year,
    totalBalls: odds.totalBalls,
    odds: odds.entries.map((entry) => ({
      slot: entry.standingIndex + 1,
      team: entry.name,
      owner: entry.owner,
      balls: entry.balls,
      percent: entry.percent,
    })),
  };

  const { randomFn, seedUsed } = getRandomSource();
  let results;
  try {
    results = runLotteryCalculation(randomFn);
    getRequiredTrades(results);
  } catch (error) {
    showToast(error.message);
    return;
  }
  state.lastRunMeta = buildRunMeta(seedUsed);
  animateLottery(results, runContext);
}

function buildDiscordText() {
  const lines = [
    "# FLOCKVILLE DRAFT LOTTERY RESULTS",
    "",
    ...state.results.map((result) => {
      const owner = result.owner !== result.team ? ` — Pick owned by **${result.owner}**` : "";
      return `**#${result.pick} — ${result.team}**${owner}`;
    }),
    "",
  ];

  if (state.lastRunMeta?.seedEnabled) {
    lines.push(`Seed: ${state.lastRunMeta.seed || "(empty seed)"}`);
    lines.push("");
  }

  lines.push("*Fair. Competitive. No Tanking.*", "**No Cheese. Just Ball.**");
  return lines.join("\n");
}

async function copyDiscordResults() {
  try {
    await navigator.clipboard.writeText(buildDiscordText());
    showToast("Discord results copied.");
  } catch {
    showToast("Clipboard blocked. Copy manually from exported JSON.");
  }
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadJson() {
  const payload = {
    schemaVersion: STORAGE_VERSION,
    generatedAt: new Date().toISOString(),
    settings: getSettingsFromUi(),
    setupLocked: state.setupLocked,
    seedEnabled: state.seedEnabled,
    seedText: state.seedText,
    lastRunMeta: state.lastRunMeta,
    teams: state.teams,
    results: state.results,
    trades: state.trades,
    seasonHistory: state.seasonHistory,
    ruleHistory: state.ruleHistory,
    seasonYear: state.seasonYear,
    manualProtectionYear: state.manualProtectionYear,
    protectionOverrides: state.protectionOverrides,
    lotteryHistory: state.lotteryHistory,
  };

  await downloadChecksummedJson(`flockville-lottery-${new Date().toISOString().slice(0, 10)}.json`, payload);
}

async function exportLotteryHistory() {
  if (!Object.keys(state.lotteryHistory).length) return;
  await downloadChecksummedJson(
    `flockville-lottery-history-${new Date().toISOString().slice(0, 10)}.json`,
    lotteryHistory.buildHistoryExport(state.lotteryHistory)
  );
  showToast("Lottery history exported.");
}

function mergeImportedHistory(incoming) {
  const preview = lotteryHistory.mergeHistory(state.lotteryHistory, incoming, { replaceConflicts: false });
  let replaceConflicts = false;
  if (preview.conflicts.length) {
    replaceConflicts = confirm(
      `The import contains lotteries for years already saved (${preview.conflicts.sort((a, b) => a - b).join(", ")}). Replace them with the imported versions? Choose Cancel to keep your saved versions.`
    );
  }

  const { merged, added, conflicts } = lotteryHistory.mergeHistory(state.lotteryHistory, incoming, { replaceConflicts });
  state.lotteryHistory = merged;
  persistHistory();
  return { added: added.length, replaced: replaceConflicts ? conflicts.length : 0 };
}

async function importLotteryHistory() {
  if (state.isRunning) return;

  const file = els.importHistoryInput.files?.[0];
  if (!file) {
    showToast("Choose a history JSON file first.");
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    if (!await approveChecksum(payload)) return;
    const incoming = lotteryHistory.extractHistoryFromPayload(payload);
    const candidates = sanitizeSeasonHistory(payload.seasonHistory);
    if (!Object.keys(incoming).length && !candidates.length) {
      showToast("No saved lotteries or finalized orders were found in that file.");
      return;
    }

    const { added, replaced } = mergeImportedHistory(incoming);
    state.importedSeasonCandidates = candidates;
    render();
    showToast(`History import: ${added} added, ${replaced} replaced.${candidates.length ? " Older finalized orders are available for explicit year assignment below." : ""}`);
  } catch {
    showToast("Invalid history file. Please choose a valid export.");
  } finally {
    els.importHistoryInput.value = "";
  }
}

function deleteSelectedHistoryYear() {
  const year = state.selectedHistoryYear;
  if (!year || !state.lotteryHistory[year] || state.isRunning) return;
  if (!confirm(`Delete the saved ${year} lottery (results, odds, and trades)? This cannot be undone.`)) return;

  state.lotteryHistory = lotteryHistory.removeYear(state.lotteryHistory, year);
  state.selectedHistoryYear = "";
  persistHistory();
  render();
  showToast(`Deleted the saved ${year} lottery.`);
}

function resetApp() {
  if (state.isRunning) {
    showToast("Cannot reset while the lottery is running.");
    return;
  }

  if (!confirm("Reset all teams, settings, trades, finalized seasons, and current lottery results? Saved Past Lotteries are kept (delete them individually in History).")) return;

  state.teams = [];
  state.results = [];
  state.trades = [];
  state.seasonHistory = [];
  state.ruleHistory = [];
  state.setupLocked = false;
  state.seedEnabled = false;
  state.seedText = "";
  state.lastRunMeta = null;
  state.manualProtectionYear = null;
  state.protectionOverrides = null;
  state.undoTradeIds = [];
  state.dryRun = null;
  state.bracket = null;
  state.finalizeDraft = null;
  state.recoveryCandidate = null;
  state.importedSeasonCandidates = [];

  applySettingsToUi({});
  snapshotRuleVersion("Rules reset to defaults.");

  els.machineText.textContent = "READY";
  els.statusText.textContent = DEFAULT_STATUS;
  render();
}

function loadDemo() {
  if (isLocked()) {
    showToast("Unlock setup before loading teams.");
    return;
  }

  const demoNames = DEMO_TEAM_PRESET.slice(0, DEMO_TEAM_COUNT);
  if (demoNames.length < DEMO_TEAM_COUNT) {
    showToast(`Demo preset is missing teams (expected ${DEMO_TEAM_COUNT}).`);
    return;
  }

  state.teams = demoNames.map((name) => ({
    id: createId(),
    name,
    owner: name,
    previousTopThree: false,
    previousNumberOne: false,
    winPct: null,
    sos: null,
    headToHead: {},
  }));

  if (state.teams[1]) state.teams[1].owner = "Baltimore Ravens";
  if (state.teams[4]) state.teams[4].previousTopThree = true;
  if (state.teams[7]) state.teams[7].previousNumberOne = true;

  state.results = [];
  state.lastRunMeta = null;
  render();
  showToast(`Loaded ${state.teams.length}-team demo.`);
}

function loadAllNflTeams() {
  if (isLocked()) {
    showToast("Unlock setup before loading teams.");
    return;
  }

  const existingNames = new Set(state.teams.map((team) => team.name.toLowerCase()));
  let added = 0;

  NFL_TEAMS.forEach((name) => {
    if (existingNames.has(name.toLowerCase())) return;
    existingNames.add(name.toLowerCase());
    state.teams.push({
      id: createId(),
      name,
      owner: name,
      previousTopThree: false,
      previousNumberOne: false,
      winPct: null,
      sos: null,
      headToHead: {},
    });
    added += 1;
  });

  state.results = [];
  state.lastRunMeta = null;
  render();

  if (added === 0) {
    showToast("All 32 NFL teams are already loaded.");
  } else {
    showToast(`Added ${added} NFL teams without duplicates.`);
  }
}

function finalizeSeason(reviewedTrades = state.trades, alreadyConfirmed = false) {
  if (state.isRunning) {
    showToast("Wait for the lottery to complete before finalizing.");
    return;
  }

  if (!state.results.length) {
    showToast("Run a lottery before finalizing a season.");
    return;
  }

  const resultYear = lotteryHistory.sanitizeYear(state.lastRunMeta?.year);
  if (resultYear === null) {
    showToast("This older live result has no verified season year. Assign its order a year in Past Lotteries instead.");
    return;
  }
  if (!alreadyConfirmed && !confirm(`Finalize the ${resultYear} draw? This will archive results and advance to ${resultYear + 1}.`)) {
    return;
  }

  state.seasonHistory.unshift({
    id: createId(),
    year: resultYear,
    finalizedAt: new Date().toISOString(),
    numberOne: state.results[0]?.team || "Unknown",
    topThree: state.results.slice(0, 3).map((result) => result.team),
    finalOrder: state.results.map((result) => ({ pick: result.pick, team: result.team, owner: result.owner })),
    seed: state.lastRunMeta?.seedEnabled ? state.lastRunMeta.seed : "",
    ruleVersionId: getActiveRuleVersion()?.id || "",
    runMeta: state.lastRunMeta || null,
    reviewedTrades: sanitizeTrades(reviewedTrades),
  });
  const savedRecord = state.lotteryHistory[String(resultYear)];
  if (savedRecord) {
    state.lotteryHistory = lotteryHistory.upsertRecord(state.lotteryHistory, {
      ...savedRecord, reviewedTrades: sanitizeTrades(reviewedTrades), finalized: true,
    });
    persistHistory();
  }

  state.seasonHistory = state.seasonHistory.slice(0, MAX_SEASON_HISTORY);
  state.results = [];
  state.lastRunMeta = null;
  state.seasonYear = lotteryHistory.sanitizeYear(resultYear + 1) ?? resultYear;
  state.manualProtectionYear = null;
  state.protectionOverrides = null;
  state.trades = sanitizeTrades(reviewedTrades);
  state.undoTradeIds = [];
  state.finalizeDraft = null;
  closeDialog(els.finalizeDialog);

  els.machineText.textContent = "READY";
  els.statusText.textContent = `Season finalized. Ready to set up the ${state.seasonYear} draw.`;

  render();
  showToast("Season finalized and archived.");
}

async function importJson() {
  if (isLocked()) {
    showToast("Unlock setup before importing.");
    return;
  }

  const file = els.importJsonInput.files?.[0];
  if (!file) {
    showToast("Choose a JSON file first.");
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!await approveChecksum(parsed)) return;
    const restored = sanitizeImportedPayload(parsed);

    state.teams = restored.teams;
    state.results = restored.results;
    state.trades = restored.trades;
    state.seasonHistory = restored.seasonHistory;
    state.ruleHistory = restored.ruleHistory;
    state.setupLocked = restored.setupLocked;
    state.seedEnabled = restored.seedEnabled;
    state.seedText = restored.seedText;
    state.lastRunMeta = restored.lastRunMeta;
    state.seasonYear = restored.seasonYear;
    state.manualProtectionYear = restored.manualProtectionYear;
    state.protectionOverrides = restored.protectionOverrides;
    state.undoTradeIds = [];
    state.dryRun = null;
    if (Object.keys(restored.lotteryHistory).length) mergeImportedHistory(restored.lotteryHistory);

    applySettingsToUi(restored.settings);
    if (!state.ruleHistory.length) snapshotRuleVersion("Rules from import.");

    if (!state.results.length) {
      els.machineText.textContent = "READY";
      els.statusText.textContent = DEFAULT_STATUS;
    }

    render();
    if (checksumWarning) els.statusText.textContent = checksumWarning;
    showToast("Import complete.");
  } catch {
    showToast("Invalid JSON import file. Please choose a valid export.");
  } finally {
    els.importJsonInput.value = "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function handleSettingsChange() {
  if (state.isRunning) {
    showToast("Cannot change settings during an active lottery.");
    return;
  }

  const clamped = clampLotteryPickCount(els.lotteryPickCount.value);
  if (String(clamped) !== String(els.lotteryPickCount.value)) {
    els.lotteryPickCount.value = String(clamped);
  }
  if (settingsMatchRuleVersion(getSettingsFromUi(), getActiveRuleVersion())) return;

  state.results = [];
  state.lastRunMeta = null;
  els.statusText.textContent = DEFAULT_STATUS;
  snapshotRuleVersion();
  renderResults();
  renderRequiredTrades();
  renderLotteryTransparency();
  renderAuditPanel();
  renderSteps();
  renderCurrentRules();
  renderRuleHistory();
  renderBracket();
  renderLockState();
  persistState();
}

function resetTradeForm() {
  state.editingTradeId = "";
  els.tradeFromInput.value = "";
  els.tradeToInput.value = "";
  els.tradeAssetsInput.value = "";
  els.tradeNotesInput.value = "";
  els.saveTradeBtn.textContent = "Add Trade";
  els.cancelTradeEditBtn.hidden = true;
}

function getTradeFormData() {
  return {
    fromTeam: normalizeName(els.tradeFromInput.value),
    toTeam: normalizeName(els.tradeToInput.value),
    assets: normalizeAssets(els.tradeAssetsInput.value),
    notes: normalizeName(els.tradeNotesInput.value),
  };
}

function saveTrade() {
  if (state.isRunning) return;
  const trade = getTradeFormData();
  if (!trade.fromTeam || !trade.toTeam) {
    showToast("Choose both a source and destination team.");
    return;
  }

  if (!trade.assets.length && !trade.notes) {
    showToast("Add at least one moved asset or note.");
    return;
  }

  if (state.editingTradeId) {
    state.trades = state.trades.map((entry) => (entry.id === state.editingTradeId ? { ...entry, ...trade } : entry));
    showToast("Trade updated.");
  } else {
    state.trades.push({ id: createId(), createdAt: new Date().toISOString(), source: "manual", ...trade });
    state.undoTradeIds = [state.trades.at(-1).id];
    showToast("Trade added.");
  }

  resetTradeForm();
  render();
}

function editTrade(id) {
  const trade = state.trades.find((entry) => entry.id === id);
  if (!trade) return;

  state.editingTradeId = id;
  els.tradeFromInput.value = trade.fromTeam;
  els.tradeToInput.value = trade.toTeam;
  els.tradeAssetsInput.value = trade.assets.join("\n");
  els.tradeNotesInput.value = trade.notes;
  els.saveTradeBtn.textContent = "Save Trade";
  els.cancelTradeEditBtn.hidden = false;
}

function removeTrade(id) {
  if (state.isRunning) return;
  state.trades = state.trades.filter((entry) => entry.id !== id);
  state.undoTradeIds = state.undoTradeIds.filter((entry) => entry !== id);
  if (state.editingTradeId === id) resetTradeForm();
  render();
  showToast("Trade removed.");
}

function buildTradeDiscordText(trades = state.trades) {
  const lines = ["# FLOCKVILLE TRADE LIST", ""];

  trades.forEach((trade, index) => {
    lines.push(`${index + 1}. ${trade.fromTeam} -> ${trade.toTeam}`);
    trade.assets.forEach((asset) => lines.push(`   - ${asset}`));
    if (trade.notes) lines.push(`   - Notes: ${trade.notes}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

async function copyTradeDiscordList() {
  if (!state.trades.length) return;
  try {
    await navigator.clipboard.writeText(buildTradeDiscordText());
    showToast("Trade list copied for Discord.");
  } catch {
    showToast("Clipboard blocked. Copy manually from the trade list.");
  }
}

function generateTradesFromResults() {
  if (state.isRunning) return;
  if (!state.results.length) {
    showToast("Run the lottery first before generating trades.");
    return;
  }

  let requiredTrades;
  try {
    requiredTrades = getRequiredTrades();
  } catch (error) {
    showToast(`Cannot generate trades: ${error.message}`);
    return;
  }
  if (!requiredTrades.length) {
    showToast("No trades needed. Every pick is already held by the team the lottery assigned it to.");
    return;
  }

  const now = new Date().toISOString();
  const addedIds = [];
  let added = 0;
  requiredTrades.forEach((trade) => {
    const notes = `Auto-generated from lottery results: ${trade.summary}.`;
    const alreadyExists = state.trades.some((entry) => entry.source === "auto" && entry.notes === notes);
    if (alreadyExists) return;

    state.trades.push({
      id: createId(),
      fromTeam: trade.fromTeam,
      toTeam: trade.toTeam,
      assets: [
        `${trade.fromTeam} sends ${buildPickLabel(trade.sendPick, trade.sendPickVia)}`,
        `${trade.toTeam} sends ${buildPickLabel(trade.receivePick, trade.receivePickVia)}`,
      ],
      notes,
      createdAt: now,
      source: "auto",
    });
    addedIds.push(state.trades.at(-1).id);
    added += 1;
  });

  if (added === 0) {
    showToast("Auto-generated trades already exist for every required pick swap.");
  } else {
    state.undoTradeIds = [addedIds.at(-1)];
    showToast(`Generated ${added} trade${added === 1 ? "" : "s"} to put the picks in lottery order.`);
  }
  render();
}

function buildSingleSeasonDiscordText(season) {
  const date = season.finalizedAt ? formatTime(season.finalizedAt) : "Unknown date";
  const lines = [
    `# FLOCKVILLE DRAFT LOTTERY — SEASON RECAP`,
    `**Finalized:** ${date}`,
    "",
    `**#1 Pick:** ${season.numberOne || "Unknown"}`,
    `**Top 3:** ${(season.topThree || []).join(", ") || "N/A"}`,
    "",
    "**Full Draft Order:**",
  ];

  (season.finalOrder || []).forEach((pick) => {
    const ownerNote = pick.owner && pick.owner !== pick.team ? ` — owned by **${pick.owner}**` : "";
    lines.push(`#${pick.pick} — ${pick.team}${ownerNote}`);
  });

  if (season.seed) {
    lines.push("", `Seed: ${season.seed}`);
  }

  lines.push("", "*Fair. Competitive. No Tanking.*", "**No Cheese. Just Ball.**");
  return lines.join("\n");
}

async function copySingleSeasonDiscord(idx) {
  const season = state.seasonHistory[idx];
  if (!season) return;
  try {
    await navigator.clipboard.writeText(buildSingleSeasonDiscordText(season));
    showToast("Season announcement copied for Discord.");
  } catch {
    showToast("Clipboard blocked. Copy manually from the season history.");
  }
}

function buildSeasonHistoryDiscordText() {
  if (!state.seasonHistory.length) return "";

  const parts = state.seasonHistory
    .slice()
    .reverse()
    .map((season) => buildSingleSeasonDiscordText(season));

  return parts.join("\n\n---\n\n");
}

async function copySeasonHistoryDiscord() {
  if (!state.seasonHistory.length) return;
  try {
    await navigator.clipboard.writeText(buildSeasonHistoryDiscordText());
    showToast("All season history copied for Discord.");
  } catch {
    showToast("Clipboard blocked. Copy manually from exported JSON.");
  }
}

async function copySeasonRecap() {
  if (!state.seasonHistory.length) return;
  const latest = state.seasonHistory[0];
  try {
    await navigator.clipboard.writeText(buildSingleSeasonDiscordText(latest));
    showToast("Latest season recap copied for Discord.");
  } catch {
    showToast("Clipboard blocked. Copy manually from the season history.");
  }
}

function renderTrades() {
  els.tradeList.innerHTML = "";
  if (els.undoTradeBtn) els.undoTradeBtn.disabled = state.isRunning || !state.undoTradeIds.some((id) => state.trades.some((trade) => trade.id === id));
  [els.exportTradesCsvBtn, els.exportTradesTableBtn].forEach((button) => {
    if (button) button.disabled = !state.trades.length;
  });

  if (!state.trades.length) {
    els.tradeList.innerHTML = '<p class="helper-text">No trades added yet. Add a trade above to build a Discord-ready list.</p>';
    els.copyTradeDiscordBtn.disabled = true;
    return;
  }

  state.trades.forEach((trade, index) => {
    const item = document.createElement("article");
    item.className = "trade-item";

    const timestampHtml = trade.createdAt
      ? `<span class="trade-timestamp">${escapeHtml(formatTime(trade.createdAt))}</span>`
      : "";
    const sourceBadge = trade.source === "auto"
      ? '<span class="trade-badge trade-badge-auto">Auto-generated</span>'
      : '<span class="trade-badge trade-badge-manual">Manual</span>';

    item.innerHTML = `
      <div class="trade-item-head">
        <div class="trade-item-title-row">
          <p class="trade-item-title">${index + 1}. ${escapeHtml(trade.fromTeam)} → ${escapeHtml(trade.toTeam)}</p>
          <div class="trade-item-meta">${sourceBadge}${timestampHtml}</div>
        </div>
        <div class="button-row">
          <button class="button secondary trade-edit-btn">Edit</button>
          <button class="button danger trade-remove-btn">Remove</button>
        </div>
      </div>
      <ul class="trade-assets">
        ${trade.assets.map((asset) => `<li>${escapeHtml(asset)}</li>`).join("")}
        ${trade.notes ? `<li><strong>Notes:</strong> ${escapeHtml(trade.notes)}</li>` : ""}
      </ul>
    `;

    item.querySelector(".trade-edit-btn").addEventListener("click", () => editTrade(trade.id));
    item.querySelector(".trade-remove-btn").addEventListener("click", () => removeTrade(trade.id));
    els.tradeList.appendChild(item);
  });

  els.copyTradeDiscordBtn.disabled = false;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.open = true;
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.open = false;
}

function buildTieBreakBadge(entry) {
  if (entry.tieBreaks?.length) {
    return sanitizeTieBreaks(entry.tieBreaks).map((description) =>
      `<span class="tie-break-badge" title="${escapeHtml(`Tied with ${description.opponents.join(", ")}; ordering by ${description.reason} for the original standings slot only, not the lottery draw.`)}">Standings tie-break: ${escapeHtml(description.reason)}</span>`).join(" ");
  }
  if (!entry.tieBreak) return "";
  return `<span class="tie-break-badge" title="${escapeHtml(`Tied with ${(entry.tieOpponents || []).join(", ")}; ordering by ${entry.tieBreak} for the original standings slot only, not the lottery draw.`)}">Standings tie-break: ${escapeHtml(entry.tieBreak)}</span>`;
}

function sanitizeTieBreaks(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => entry && ["Strength of Schedule", "Head-to-head", "Coin flip"].includes(entry.reason))
    .map((entry) => ({ reason: entry.reason, opponents: Array.isArray(entry.opponents) ? entry.opponents.map(normalizeName).filter(Boolean) : [] }));
}

function undoLastTrade() {
  if (state.isRunning || !state.undoTradeIds.length) return;
  const removed = new Set([state.undoTradeIds.at(-1)]);
  state.trades = state.trades.filter((trade) => !removed.has(trade.id));
  if (removed.has(state.editingTradeId)) resetTradeForm();
  state.undoTradeIds = [];
  render();
  showToast("Last trade addition undone. Add a new trade to enable undo again.");
}

/** Keep edits staged in the dialog until final confirmation; cancelling leaves live trades intact. */
function openFinalizeReview() {
  if (state.isRunning || !state.results.length) return;
  state.finalizeDraft = sanitizeTrades(state.trades);
  renderFinalizeReview();
  openDialog(els.finalizeDialog);
}

function renderFinalizeReview() {
  els.finalizeTradeList.innerHTML = "";
  (state.finalizeDraft || []).forEach((trade, index) => {
    const item = document.createElement("article");
    item.className = "trade-item";
    item.innerHTML = `
      <label>From team <input class="review-from" value="${escapeHtml(trade.fromTeam)}"></label>
      <label>To team <input class="review-to" value="${escapeHtml(trade.toTeam)}"></label>
      <label>Assets <textarea class="review-assets">${escapeHtml(trade.assets.join("\n"))}</textarea></label>
      <label>Notes <textarea class="review-notes">${escapeHtml(trade.notes)}</textarea></label>
      <button type="button" class="button danger review-remove">Remove trade ${index + 1}</button>`;
    [[".review-from", "fromTeam"], [".review-to", "toTeam"], [".review-assets", "assets"], [".review-notes", "notes"]]
      .forEach(([selector, field]) => item.querySelector(selector).addEventListener("input", (event) => {
        trade[field] = field === "assets" ? normalizeAssets(event.target.value) : normalizeName(event.target.value);
      }));
    item.querySelector(".review-remove").addEventListener("click", () => {
      state.finalizeDraft = state.finalizeDraft.filter((entry) => entry !== trade);
      renderFinalizeReview();
    });
    els.finalizeTradeList.appendChild(item);
  });
  if (!state.finalizeDraft?.length) {
    els.finalizeTradeList.innerHTML = '<p class="helper-text">No trades in the reviewed list. Confirm to finalize the draft order without logged trades.</p>';
  }
}

function confirmFinalizeReview() {
  if (!state.finalizeDraft) return;
  if (state.finalizeDraft.some((trade) => !sanitizeTrade(trade))) {
    showToast("Every reviewed trade needs both teams and at least one asset or note.");
    return;
  }
  finalizeSeason(state.finalizeDraft, true);
}

function renderFlagAudit() {
  if (!els.flagSourcePanel) return;
  const summary = els.flagSourceSummary || els.flagSourcePanel;
  const protection = getProtection();
  const flagLabel = { previousNumberOne: "Previous #1", previousTopThree: "Previous top three" };
  const previous = protection.record;
  const recordAudit = `<div class="audit-row"><strong>Previous record:</strong>
    <span>Year: ${protection.priorYear} · finalized:${previous?.finalized ? "Y" : "N"} · manual:${previous?.source === "manual" ? "Y" : "N"}</span></div>
    <div class="audit-row"><strong>Recorded previous #1:</strong> <span>${escapeHtml(previous?.finalOrder.find((pick) => pick.pick === 1)?.team || "Unavailable")}</span></div>
    <div class="audit-row"><strong>Recorded previous top three:</strong> <span>${escapeHtml(previous?.finalOrder.filter((pick) => pick.pick <= 3).map((pick) => pick.team).join(", ") || "Unavailable")}</span></div>`;
  summary.innerHTML = recordAudit + ["previousNumberOne", "previousTopThree"].map((flag) => {
    const source = hasProtectionOverride(flag) ? `Manual ${flagLabel[flag]} override for ${state.seasonYear}`
      : protection.automatic ? `${protection.priorYear} saved history`
        : state.manualProtectionYear === state.seasonYear ? `Legacy manual flags for ${state.seasonYear}` : "No confirmed source";
    const names = protection.teams.filter((team) => team[flag]).map((team) => team.name).join(", ") || "None";
    return `<div class="audit-row"><strong>${flagLabel[flag]}:</strong> <span>${escapeHtml(names)} — ${escapeHtml(source)}</span></div>`;
  }).join("");
  [els.overrideNumberOneBtn, els.overrideTopThreeBtn, els.clearProtectionOverrideBtn].forEach((button) => {
    if (button) button.disabled = isLocked();
  });
}

function openFlagOverride(flag) {
  if (isLocked()) return;
  state.editingProtectionFlag = flag;
  els.flagOverrideTeams.innerHTML = "";
  getProtection().teams.forEach((team) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" ${team[flag] ? "checked" : ""}> ${escapeHtml(team.name)}`;
    const checkbox = label.querySelector("input");
    checkbox.checked = Boolean(team[flag]);
    checkbox.dataset.teamName = team.name;
    els.flagOverrideTeams.appendChild(label);
  });
  const title = document.getElementById("flagOverrideHeading") || document.getElementById("flagOverrideTitle");
  if (title) title.textContent = state.editingProtectionFlag === "previousNumberOne"
    ? `Override previous #1 for ${state.seasonYear}` : `Override previous top three for ${state.seasonYear}`;
  openDialog(els.flagOverrideDialog);
}

function saveFlagOverride() {
  if (isLocked() || !["previousNumberOne", "previousTopThree"].includes(state.editingProtectionFlag)) return;
  const names = [...els.flagOverrideTeams.querySelectorAll("input")]
    .filter((input) => input.checked).map((input) => input.dataset.teamName);
  const overrides = state.protectionOverrides?.year === state.seasonYear ? state.protectionOverrides : { year: state.seasonYear };
  state.protectionOverrides = { ...overrides, [state.editingProtectionFlag]: names };
  state.results = [];
  state.lastRunMeta = null;
  closeDialog(els.flagOverrideDialog);
  state.editingProtectionFlag = "";
  render();
}

function clearProtectionOverrides() {
  if (isLocked()) return;
  state.protectionOverrides = null;
  state.manualProtectionYear = null;
  state.results = [];
  state.lastRunMeta = null;
  render();
}

/** A dry run uses the real calculation, capturing exports separately without persisting or touching live data. */
function createDryRun(randomFn = getRandomSource().randomFn) {
  if (state.isRunning || state.teams.length < 2) return;
  if (!protectionReady()) {
    showToast(`Missing ${state.seasonYear - 1} history. Confirm protection flags before a dry run.`);
    return;
  }
  try {
    const results = runLotteryCalculation(randomFn);
    const odds = buildLotteryTransparencyData();
    const meta = { ...buildRunMeta(getRandomSource().seedUsed), completed: true };
    state.dryRun = JSON.parse(JSON.stringify({
      year: state.seasonYear, runAt: meta.timestamp, savedAt: meta.timestamp,
      teams: state.teams,
      finalOrder: results.map((entry) => ({ ...entry, originalSlot: getOriginalSlot(entry) })),
      odds: odds.entries.map((entry) => ({
        slot: entry.standingIndex + 1, team: entry.name, owner: entry.owner, balls: entry.balls, percent: entry.percent,
      })),
      totalBalls: odds.totalBalls, trades: getRequiredTrades(results),
      settings: getSettingsFromUi(), seed: meta.seedEnabled ? meta.seed : "",
      ruleVersionId: getActiveRuleVersion()?.id || "",
    }));
    if (els.dryRunYearInput) els.dryRunYearInput.value = String(state.seasonYear + 1);
    renderDryRun();
  } catch (error) {
    showToast(error.message);
  }
}

function renderDryRun() {
  if (!els.dryRunPanel) return;
  els.dryRunPanel.hidden = !state.dryRun;
  if (!state.dryRun) return;
  if (!els.dryRunSnapshotSummary) {
    els.dryRunSnapshotSummary = document.createElement("div");
    els.dryRunSnapshotSummary.id = "dryRunSnapshotSummary";
    els.dryRunSnapshotSummary.className = "audit-summary";
    els.dryRunPanel.insertBefore(els.dryRunSnapshotSummary, els.dryRunPanel.firstChild);
  }
  els.dryRunSnapshotSummary.innerHTML = `
    <p><strong>Snapshot year:</strong> ${state.dryRun.year} · <strong>Captured:</strong> ${escapeHtml(formatTime(state.dryRun.runAt))}</p>
    <p><strong>Snapshot rules:</strong> ${escapeHtml(formatRuleSettings(state.dryRun.settings))}</p>
    <p><strong>Snapshot seed:</strong> ${escapeHtml(state.dryRun.seed || "Not seeded")} · <strong>Teams:</strong> ${state.dryRun.teams.length}</p>
    <p class="helper-text">Snapshot only: later setup changes do not update this preview.</p>`;
  els.dryRunResults.innerHTML = state.dryRun.finalOrder.map((entry) =>
    `<article class="result-card"><div class="result-pick-row"><div class="result-pick">Pick #${entry.pick}</div>${buildMovementBadge(getOriginalSlot(entry), entry.pick)}</div>
      <div class="result-team">${escapeHtml(entry.team)}</div>
      <div class="result-owner">${escapeHtml(entry.owner)}</div>
      ${getOriginalSlot(entry) ? `<div class="result-original" title="Original slot before the lottery (worst record is #1).">Pre-lottery slot: #${getOriginalSlot(entry)}</div>` : ""}
      ${entry.note ? `<div class="result-note">${escapeHtml(entry.note)}</div>` : ""}${buildTieBreakBadge(entry)}</article>`).join("");
  els.dryRunTrades.innerHTML = buildRequiredTradesMarkup(state.dryRun.trades, "No required trades in this dry run.");
}

function saveDryRun() {
  if (!state.dryRun || state.isRunning) return;
  const year = lotteryHistory.sanitizeYear(els.dryRunYearInput.value);
  if (year === null || year === state.dryRun.year || state.lotteryHistory[String(year)]) {
    showToast("Choose a valid new year, different from the simulated year and any saved year.");
    return;
  }
  if (!confirm(`Save this simulated order as ${year}? Live results and setup will remain unchanged.`)) return;
  state.lotteryHistory = lotteryHistory.upsertRecord(state.lotteryHistory, {
    ...state.dryRun, year, source: "dry-run",
  });
  state.selectedHistoryYear = String(year);
  state.dryRun = null;
  persistHistory();
  renderDryRun();
  renderLotteryHistory();
  showToast(`Dry run saved as ${year}.`);
}

async function exportDryRun() {
  if (!state.dryRun) return;
  await downloadChecksummedJson(`flockville-dry-run-${state.dryRun.year}.json`, {
    ...lotteryHistory.buildHistoryExport({ [state.dryRun.year]: state.dryRun }),
    teams: state.dryRun.teams, dryRun: true,
  });
}

function generateBracket() {
  if (!state.results.length || state.isRunning) return;
  try {
    state.bracket = lotteryTools.buildBracket(state.results, Number(els.playoffTeamCount.value));
    state.bracketResults = JSON.parse(JSON.stringify(state.results));
    renderBracket();
  } catch (error) {
    showToast(error.message);
  }
}

function renderBracket() {
  if (!els.bracketPanel) return;
  const results = els.bracketResults || els.bracketPanel;
  const valid = state.bracket && JSON.stringify(state.bracketResults) === JSON.stringify(state.results);
  if (!valid && state.bracketResults) state.bracket = null;
  [els.exportBracketCsvBtn, els.exportBracketTextBtn].forEach((button) => {
    if (button) button.disabled = !state.bracket;
  });
  if (!state.bracket) {
    els.bracketPanel.hidden = true;
    results.innerHTML = '<p class="helper-text">Generate a playoff bracket from completed lottery results.</p>';
    return;
  }
  els.bracketPanel.hidden = false;
  const label = (seed) => `#${seed.seed} ${escapeHtml(seed.team)} (pick #${seed.pick}, ${escapeHtml(seed.owner)})`;
  results.innerHTML = `<h3>Seed order</h3><ol class="bracket-seeds">${state.bracket.seeds.map((seed) =>
    `<li>${label(seed)}</li>`).join("")}</ol><div class="bracket-grid">${state.bracket.matches.map((match) =>
    `<article class="bracket-match">${label(match.home)}<br>${match.away ? `vs ${label(match.away)}` : "BYE"}</article>`).join("")}</div>`;
}

function renderMobileTeams() {
  if (!els.mobileTeamList) return;
  els.mobileTeamList.innerHTML = "";
  const entriesById = new Map(buildLotteryEntries().map((entry) => [entry.id, entry]));
  const protection = getProtection();
  const locked = isLocked();
  const ownerNames = [...new Set([...state.teams.map((team) => team.name), ...state.teams.map((team) => team.owner), ...NFL_TEAMS])];
  const options = (names, selected) => names.map((name) =>
    `<option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");
  protection.teams.forEach((team, index) => {
    const card = document.createElement("article");
    card.className = "mobile-team-card";
    card.dataset.teamId = team.id;
    card.innerHTML = `<div class="mobile-team-heading"><strong>#${index + 1} ${escapeHtml(team.name)}</strong><span>${getBallCount(index)} balls</span></div>
      ${buildTieBreakBadge(entriesById.get(team.id) || {})}
      <div class="mobile-team-fields">
        <label>Team name <select class="team-name-edit mobile-name" aria-label="${escapeHtml(team.name)} team name" ${locked ? "disabled" : ""}>
          ${options(NFL_TEAMS.includes(team.name) ? NFL_TEAMS : [team.name, ...NFL_TEAMS], team.name)}
        </select></label>
        <label>Pick owner <select class="owner-edit mobile-owner" aria-label="${escapeHtml(team.name)} pick owner" ${locked ? "disabled" : ""}>${options(ownerNames, team.owner)}</select></label>
      </div>
      <div class="mobile-team-flags">
        <label>Previous top three <input class="inline-check previous-top-three" type="checkbox" aria-label="${escapeHtml(team.name)} previous top three"
          ${team.previousTopThree ? "checked" : ""} ${locked || protection.automatic || hasProtectionOverride("previousTopThree") ? "disabled" : ""}></label>
        <label>Previous #1 <input class="inline-check previous-number-one" type="checkbox" aria-label="${escapeHtml(team.name)} previous number one"
          ${team.previousNumberOne ? "checked" : ""} ${locked || protection.automatic || hasProtectionOverride("previousNumberOne") ? "disabled" : ""}></label>
      </div>
      <div class="button-row">
        <button class="button secondary mobile-team-reorder mobile-up" aria-label="Move ${escapeHtml(team.name)} up" ${isLocked() || !index ? "disabled" : ""}>↑ Up</button>
        <button class="button secondary mobile-team-reorder mobile-down" aria-label="Move ${escapeHtml(team.name)} down" ${isLocked() || index === state.teams.length - 1 ? "disabled" : ""}>↓ Down</button>
        <button class="button danger mobile-remove" aria-label="Remove ${escapeHtml(team.name)}" ${locked ? "disabled" : ""}>Remove</button>
      </div>`;
    card.querySelector(".mobile-name").addEventListener("change", (event) => {
      if (!renameTeam(team.id, event.target.value)) event.target.value = team.name;
    });
    card.querySelector(".mobile-owner").addEventListener("change", (event) => {
      updateTeam(team.id, "owner", normalizeName(event.target.value) || team.name);
    });
    card.querySelector(".previous-top-three").addEventListener("change", (event) => updateTeam(team.id, "previousTopThree", event.target.checked));
    card.querySelector(".previous-number-one").addEventListener("change", (event) => updateTeam(team.id, "previousNumberOne", event.target.checked));
    card.querySelector(".mobile-up").addEventListener("click", () => moveTeam(team.id, -1));
    card.querySelector(".mobile-down").addEventListener("click", () => moveTeam(team.id, 1));
    card.querySelector(".mobile-remove").addEventListener("click", () => removeTeam(team.id));
    els.mobileTeamList.appendChild(card);
  });
}

function restoreRuleVersion(id) {
  if (isLocked()) return;
  const version = state.ruleHistory.find((entry) => entry.id === id);
  if (!version || version.id === getActiveRuleVersion()?.id) return;
  const changes = lotteryTools?.ruleChanges(getSettingsFromUi(), version.settings) || [];
  if (!confirm(`Restore rules from ${formatTime(version.effectiveAt)}?\n${changes.join("\n")}\nA new rule version will be created. Current results will be cleared.`)) return;
  applySettingsToUi(version.settings);
  snapshotRuleVersion(`Restored rule version ${version.id}.`, true);
  state.results = [];
  state.lastRunMeta = null;
  render();
}

async function downloadChecksummedJson(fileName, payload) {
  try {
    const signed = await lotteryTools.withChecksum(payload);
    downloadJsonFile(fileName, signed);
  } catch (error) {
    showToast(`Could not export checksum: ${error.message}`);
  }
}

async function approveChecksum(payload) {
  try {
    const verification = await lotteryTools.verifyChecksum(payload);
    checksumWarning = verification.present && !verification.valid
      ? "Warning: this file's checksum does not match its contents. It may have been edited or corrupted; review imported data carefully."
      : "";
  } catch {
    checksumWarning = "Warning: the checksum could not be verified. Import continued; review imported data carefully.";
  }
  if (checksumWarning) {
    showToast(checksumWarning);
    els.statusText.textContent = checksumWarning;
  }
  return true;
}

function downloadTextFile(fileName, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportTradesTable() {
  try {
    await navigator.clipboard.writeText(lotteryTools.tradesTable(state.trades));
    showToast("Trade table copied.");
  } catch {
    downloadTextFile(`flockville-trades-${new Date().toISOString().slice(0, 10)}.txt`, lotteryTools.tradesTable(state.trades));
    showToast("Clipboard unavailable. Trade table downloaded instead.");
  }
}

/** Parse and sanitize recovery material without writing anything; only explicit Merge commits the preview. */
async function previewRecovery() {
  if (state.isRunning) return;
  state.recoveryCandidate = null;
  els.mergeRecoveryBtn.disabled = true;
  try {
    const file = els.recoveryFileInput.files?.[0];
    const text = file ? await file.text() : els.recoveryText.value;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* Damaged exports can still contain recoverable records. */ }
    if (parsed && !await approveChecksum(parsed)) return;
    const incoming = lotteryTools.recoverHistory(text);
    const preview = lotteryHistory.mergeHistory(state.lotteryHistory, incoming, { replaceConflicts: false });
    state.recoveryCandidate = incoming;
    const years = lotteryHistory.getSortedYears(incoming);
    if (!years.length) throw new Error("No recoverable lottery years found.");
    els.recoveryPreview.innerHTML = `<p>Recovered years: ${years.join(", ")}. New: ${preview.added.length}. Conflicts: ${preview.conflicts.join(", ") || "None"}.</p>
      ${years.map((year) => `<details><summary>${year} recovered order — ${incoming[String(year)].finalOrder.length} picks, ${incoming[String(year)].odds.length} odds entries</summary>${buildHistoryDetailMarkup(incoming[String(year)])}</details>`).join("")}`;
    els.mergeRecoveryBtn.disabled = false;
  } catch (error) {
    state.recoveryCandidate = null;
    els.recoveryPreview.textContent = error.message;
  }
}

function mergeRecovery() {
  if (state.isRunning || !state.recoveryCandidate) return;
  if (!confirm("Merge the previewed recovered records into saved history? Review conflicts before replacing any saved years.")) return;
  mergeImportedHistory(state.recoveryCandidate);
  state.recoveryCandidate = null;
  els.mergeRecoveryBtn.disabled = true;
  els.recoveryPreview.textContent = "Recovered history merged. Export History for a backup.";
  render();
}

function archiveSelectedHistoryYear() {
  if (state.isRunning) return;
  const record = state.lotteryHistory[state.selectedHistoryYear];
  if (!record) return;
  state.lotteryHistory = lotteryHistory.upsertRecord(state.lotteryHistory, { ...record, archived: !record.archived });
  persistHistory();
  render();
}

/** Update draw-dependent views without replacing a mobile button receiving the input's blur click. */
function updateSeedText(value) {
  if (state.isRunning) return;
  const seedText = normalizeName(value);
  if (seedText === state.seedText) return;
  state.seedText = seedText;
  els.seedInput.value = seedText;
  state.results = [];
  state.lastRunMeta = null;
  els.statusText.textContent = DEFAULT_STATUS;
  renderResults();
  renderRequiredTrades();
  renderLotteryTransparency();
  renderAuditPanel();
  renderSteps();
  renderBracket();
  persistState();
}

/** Refresh season-derived flags in place so a year input blur cannot swallow a card button click. */
function updateSeasonYear(value) {
  if (state.isRunning) return;
  const year = lotteryHistory.sanitizeYear(value);
  if (year === null) {
    showToast("Season year must be a 4-digit year.");
    els.seasonYearInput.value = String(state.seasonYear);
    return;
  }
  if (year === state.seasonYear) return;
  state.seasonYear = year;
  state.manualProtectionYear = null;
  els.seasonYearInput.value = String(year);
  const protection = getProtection();
  const byId = new Map(protection.teams.map((team) => [team.id, team]));
  [els.teamTableBody, els.mobileTeamList].filter(Boolean).forEach((container) => {
    [...container.children].forEach((row) => {
      const team = byId.get(row.dataset.teamId);
      if (!team) return;
      [[".previous-top-three", "previousTopThree"], [".previous-number-one", "previousNumberOne"]]
        .forEach(([selector, flag]) => {
          const checkbox = row.querySelector(selector);
          if (!checkbox) return;
          checkbox.checked = Boolean(team[flag]);
          checkbox.disabled = isLocked() || protection.automatic || hasProtectionOverride(flag);
        });
    });
  });
  renderProtection();
  renderFlagAudit();
  renderLotteryTransparency();
  renderAuditPanel();
  persistState();
}

els.addTeamBtn.addEventListener("click", () => {
  addTeam(els.teamNameInput.value, els.pickOwnerInput.value);
  els.teamNameInput.value = "";
  els.pickOwnerInput.value = "";
  els.teamNameInput.focus();
});

els.teamNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.addTeamBtn.click();
});

els.loadDemoBtn.addEventListener("click", loadDemo);
els.loadAllNflBtn.addEventListener("click", loadAllNflTeams);
els.resetBtn.addEventListener("click", resetApp);
els.startLotteryBtn.addEventListener("click", startLottery);
els.finalizeSeasonBtn.addEventListener("click", openFinalizeReview);
els.generateTradesBtn.addEventListener("click", generateTradesFromResults);
els.copyLotteryAnnouncementBtn.addEventListener("click", copyDiscordResults);
els.copySeasonRecapBtn.addEventListener("click", copySeasonRecap);
els.copySeasonHistoryDiscordBtn.addEventListener("click", copySeasonHistoryDiscord);
els.copyDiscordBtn.addEventListener("click", copyDiscordResults);
els.downloadJsonBtn.addEventListener("click", downloadJson);
els.importJsonBtn.addEventListener("click", importJson);
els.saveTradeBtn.addEventListener("click", saveTrade);
els.cancelTradeEditBtn.addEventListener("click", () => {
  resetTradeForm();
  render();
});
els.copyTradeDiscordBtn.addEventListener("click", copyTradeDiscordList);
els.historyYearSelect.addEventListener("change", () => {
  state.selectedHistoryYear = els.historyYearSelect.value;
  renderLotteryHistory();
});
els.deleteHistoryYearBtn.addEventListener("click", deleteSelectedHistoryYear);
els.exportHistoryBtn.addEventListener("click", exportLotteryHistory);
els.importHistoryBtn.addEventListener("click", importLotteryHistory);
const enhancementActions = {
  undoTradeBtn: undoLastTrade,
  exportTradesCsvBtn: () => downloadTextFile("flockville-trades.csv", lotteryTools.tradesCsv(state.trades), "text/csv"),
  exportTradesTableBtn: exportTradesTable,
  confirmFinalizeBtn: confirmFinalizeReview,
  cancelFinalizeBtn: () => { state.finalizeDraft = null; closeDialog(els.finalizeDialog); },
  dryRunBtn: () => createDryRun(),
  saveDryRunBtn: saveDryRun,
  discardDryRunBtn: () => { state.dryRun = null; renderDryRun(); },
  exportDryRunBtn: exportDryRun,
  generateBracketBtn: generateBracket,
  exportBracketCsvBtn: () => {
    if (state.bracket) downloadTextFile("flockville-playoffs.csv", lotteryTools.bracketCsv(state.bracket), "text/csv");
  },
  exportBracketTextBtn: () => {
    if (state.bracket) downloadTextFile("flockville-playoffs.txt", lotteryTools.bracketText(state.bracket));
  },
  overrideNumberOneBtn: () => openFlagOverride("previousNumberOne"),
  overrideTopThreeBtn: () => openFlagOverride("previousTopThree"),
  saveFlagOverrideBtn: saveFlagOverride,
  cancelFlagOverrideBtn: () => { state.editingProtectionFlag = ""; closeDialog(els.flagOverrideDialog); },
  clearProtectionOverrideBtn: clearProtectionOverrides,
  previewRecoveryBtn: previewRecovery,
  mergeRecoveryBtn: mergeRecovery,
  archiveHistoryYearBtn: archiveSelectedHistoryYear,
};
Object.entries(enhancementActions).forEach(([id, action]) => els[id]?.addEventListener("click", action));
els.showArchivedToggle?.addEventListener("change", renderLotteryHistory);
els.finalizeDialog?.addEventListener("cancel", () => { state.finalizeDraft = null; });
els.flagOverrideDialog?.addEventListener("cancel", () => { state.editingProtectionFlag = ""; });
document.getElementById("newHistoryBtn").addEventListener("click", () => openHistoryEditor());
document.getElementById("editHistoryBtn").addEventListener("click", () => openHistoryEditor(state.lotteryHistory[state.selectedHistoryYear]));
document.getElementById("addHistoryPickBtn").addEventListener("click", () => addHistoryRow());
document.getElementById("saveManualHistoryBtn").addEventListener("click", saveManualHistory);
document.getElementById("cancelManualHistoryBtn").addEventListener("click", () => {
  state.editingHistoryRecord = null;
  document.getElementById("manualHistoryEditor").open = false;
  document.getElementById("manualHistoryRows").innerHTML = "";
});
document.getElementById("loadLegacySeasonBtn").addEventListener("click", () => {
  const season = getLegacyCandidates()[Number(document.getElementById("legacySeasonSelect").value)];
  if (!season) return;
  const finalOrder = season.finalOrder.length
    ? season.finalOrder : season.topThree.map((team, index) => ({ pick: index + 1, team }));
  if (!finalOrder.length) {
    showToast("No recoverable order in this archive. Enter the actual results manually.");
    return;
  }
  openHistoryEditor({ year: season.year, finalOrder, source: "manual",
    completeness: season.finalOrder.length ? "complete" : "top-three",
    seed: season.seed, runAt: season.runMeta?.timestamp || "",
    ruleVersionId: season.ruleVersionId,
    settings: state.ruleHistory.find((rule) => rule.id === season.ruleVersionId)?.settings || null });
});
document.getElementById("manualProtectionToggle").addEventListener("change", (event) => {
  if (isLocked()) return;
  const protection = getProtection();
  if (event.target.checked && protection.automatic) {
    state.teams = protection.teams;
  }
  state.manualProtectionYear = event.target.checked ? state.seasonYear : null;
  render();
});
els.seasonYearInput.addEventListener("change", () => {
  updateSeasonYear(els.seasonYearInput.value);
});

els.setupLockBtn.addEventListener("click", () => {
  if (state.isRunning) return;
  state.setupLocked = !state.setupLocked;
  render();
  showToast(state.setupLocked ? "Setup locked." : "Setup unlocked.");
});

els.lotteryPickCount.addEventListener("change", handleSettingsChange);
els.bottomProtectionToggle.addEventListener("change", handleSettingsChange);
els.topThreeCooldownToggle.addEventListener("change", handleSettingsChange);
els.consecutiveOneToggle.addEventListener("change", handleSettingsChange);

els.seedEnabledToggle.addEventListener("change", () => {
  if (state.isRunning) return;
  state.seedEnabled = els.seedEnabledToggle.checked;
  state.results = [];
  state.lastRunMeta = null;
  render();
});

els.seedInput.addEventListener("change", () => {
  updateSeedText(els.seedInput.value);
});

restoreStateFromStorage();
restoreHistoryFromStorage();
if (!state.ruleHistory.length) snapshotRuleVersion("Initial rules.");
els.seedEnabledToggle.checked = state.seedEnabled;
els.seedInput.value = state.seedText;
els.statusText.textContent = state.results.length ? "Previous lottery loaded from saved state." : DEFAULT_STATUS;
resetTradeForm();
render();

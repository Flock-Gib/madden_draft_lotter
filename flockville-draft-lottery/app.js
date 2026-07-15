const STORAGE_KEY = "flockvilleDraftLotteryState";
const STORAGE_VERSION = 2;
const MAX_SEASON_HISTORY = 12;
const DEFAULT_STATUS = "Add teams, confirm the settings, and start the draw.";

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
  seasonHistory: [],
  setupLocked: false,
  seedEnabled: false,
  seedText: "",
  lastRunMeta: null,
  isRunning: false,
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
  auditSummary: document.getElementById("auditSummary"),
  seasonHistoryList: document.getElementById("seasonHistoryList"),
  importJsonInput: document.getElementById("importJsonInput"),
  importJsonBtn: document.getElementById("importJsonBtn"),
  copyDiscordBtn: document.getElementById("copyDiscordBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
};

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
        finalizedAt: normalizeName(entry.finalizedAt) || new Date().toISOString(),
        numberOne: normalizeName(entry.numberOne) || (topThree[0] || "Unknown"),
        topThree,
        finalOrder,
        seed: normalizeName(entry.seed),
      };
    });
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
    results: sanitizeResults(payload.results, payloadTeams),
    seasonHistory: sanitizeSeasonHistory(payload.seasonHistory),
    setupLocked: Boolean(payload.setupLocked),
    seedEnabled: Boolean(payload.seedEnabled),
    seedText: normalizeName(payload.seedText),
    lastRunMeta: payload.lastRunMeta && typeof payload.lastRunMeta === "object" ? payload.lastRunMeta : null,
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
      seasonHistory: state.seasonHistory,
      setupLocked: state.setupLocked,
      seedEnabled: state.seedEnabled,
      seedText: state.seedText,
      lastRunMeta: state.lastRunMeta,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write failures.
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
    state.seasonHistory = restored.seasonHistory;
    state.setupLocked = restored.setupLocked;
    state.seedEnabled = restored.seedEnabled;
    state.seedText = restored.seedText;
    state.lastRunMeta = restored.lastRunMeta;

    applySettingsToUi(restored.settings);
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

function renderOwnerOptions() {
  const currentValue = els.pickOwnerInput.value;
  els.pickOwnerInput.innerHTML = '<option value="">Pick owned by same team</option>';

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
  });

  if ([...els.pickOwnerInput.options].some((option) => option.value === currentValue)) {
    els.pickOwnerInput.value = currentValue;
  }
}

function renderTeams() {
  els.teamTableBody.innerHTML = "";
  const locked = isLocked();

  state.teams.forEach((team, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <button class="remove-btn move-up" title="Move up" ${locked ? "disabled" : ""}>↑</button>
        <strong>${index + 1}</strong>
        <button class="remove-btn move-down" title="Move down" ${locked ? "disabled" : ""}>↓</button>
      </td>
      <td><input class="team-name-edit" value="${escapeHtml(team.name)}" ${locked ? "disabled" : ""} /></td>
      <td><input class="owner-edit" value="${escapeHtml(team.owner)}" ${locked ? "disabled" : ""} /></td>
      <td><strong>${getBallCount(index)}</strong></td>
      <td><input class="inline-check previous-top-three" type="checkbox" ${team.previousTopThree ? "checked" : ""} ${locked ? "disabled" : ""} /></td>
      <td><input class="inline-check previous-number-one" type="checkbox" ${team.previousNumberOne ? "checked" : ""} ${locked ? "disabled" : ""} /></td>
      <td><button class="remove-btn remove-team" ${locked ? "disabled" : ""}>Remove</button></td>
    `;

    row.querySelector(".move-up").addEventListener("click", () => moveTeam(team.id, -1));
    row.querySelector(".move-down").addEventListener("click", () => moveTeam(team.id, 1));
    row.querySelector(".remove-team").addEventListener("click", () => removeTeam(team.id));

    row.querySelector(".team-name-edit").addEventListener("change", (event) => {
      const oldName = team.name;
      const attemptedName = normalizeName(event.target.value);
      const newName = attemptedName || oldName;

      const duplicateExists = state.teams.some(
        (entry) => entry.id !== team.id && entry.name.toLowerCase() === newName.toLowerCase()
      );

      if (duplicateExists) {
        showToast("That team name already exists.");
        event.target.value = oldName;
        return;
      }

      team.name = newName;
      if (team.owner === oldName) team.owner = newName;
      state.results = [];
      state.lastRunMeta = null;
      render();
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

function renderResults() {
  els.resultsGrid.innerHTML = "";

  state.results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const ownerText = result.owner !== result.team ? `Pick owned by ${result.owner}` : "Original team owns pick";

    card.innerHTML = `
      <div class="result-pick">Pick #${result.pick}</div>
      <div class="result-team">${escapeHtml(result.team)}</div>
      <div class="result-owner">${escapeHtml(ownerText)}</div>
      ${result.note ? `<div class="result-note">${escapeHtml(result.note)}</div>` : ""}
    `;

    els.resultsGrid.appendChild(card);
  });

  const hasResults = state.results.length > 0;
  els.copyDiscordBtn.disabled = !hasResults;
  els.downloadJsonBtn.disabled = !hasResults;
  els.finalizeSeasonBtn.disabled = !hasResults || state.isRunning;
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

  els.auditSummary.innerHTML = rows
    .map(([label, value]) => `<div class="audit-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(value)}</span></div>`)
    .join("");
}

function renderSeasonHistory() {
  els.seasonHistoryList.innerHTML = "";

  if (!state.seasonHistory.length) {
    els.seasonHistoryList.innerHTML = '<p class="helper-text">No finalized seasons yet.</p>';
    return;
  }

  state.seasonHistory.forEach((season) => {
    const item = document.createElement("article");
    item.className = "history-item";

    item.innerHTML = `
      <p class="history-item-title">${escapeHtml(formatTime(season.finalizedAt))}</p>
      <p class="history-item-line"><strong>#1:</strong> ${escapeHtml(season.numberOne || "Unknown")}</p>
      <p class="history-item-line"><strong>Top 3:</strong> ${escapeHtml((season.topThree || []).join(", ") || "N/A")}</p>
    `;

    els.seasonHistoryList.appendChild(item);
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

  els.startLotteryBtn.disabled = state.isRunning || state.teams.length < 2;
  els.resetBtn.disabled = state.isRunning;

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
  renderOwnerOptions();
  renderTeams();
  renderResults();
  renderAuditPanel();
  renderSeasonHistory();
  renderLockState();
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

function buildLotteryEntries() {
  return state.teams.map((team, index) => ({
    ...team,
    standingIndex: index,
    balls: getBallCount(index),
  }));
}

function isEligibleForPick(entry, pick, remainingEntries) {
  const topThreeCooldown = els.topThreeCooldownToggle.checked;
  const noConsecutiveOne = els.consecutiveOneToggle.checked;

  if (pick === 1 && noConsecutiveOne && entry.previousNumberOne) {
    const alternativeExists = remainingEntries.some((team) => !team.previousNumberOne);
    if (alternativeExists) return false;
  }

  if (pick <= 3 && topThreeCooldown && entry.previousTopThree) {
    const alternativeExists = remainingEntries.some((team) => !team.previousTopThree);
    if (alternativeExists) return false;
  }

  return true;
}

function applyBottomFourProtection(results, allEntries) {
  if (!els.bottomProtectionToggle.checked) return results;

  const protectedIds = new Set(allEntries.slice(0, 4).map((team) => team.id));
  const maxProtectedPick = Math.min(8, results.length);

  const top = results.slice(0, maxProtectedPick);
  const rest = results.slice(maxProtectedPick);

  const protectedInTop = top.filter((r) => protectedIds.has(r.id));
  const protectedInRest = rest.filter((r) => protectedIds.has(r.id));

  if (protectedInRest.length === 0) return results;

  const nonProtectedInTop = top.filter((r) => !protectedIds.has(r.id));
  const newTop = [...protectedInTop, ...protectedInRest];

  while (newTop.length < maxProtectedPick && nonProtectedInTop.length) {
    newTop.push(nonProtectedInTop.shift());
  }

  const usedIds = new Set(newTop.map((r) => r.id));
  const newRest = results.filter((r) => !usedIds.has(r.id));

  const originalIndexById = new Map(results.map((r, i) => [r.id, i]));
  newTop.forEach((r) => {
    if (protectedIds.has(r.id) && originalIndexById.get(r.id) > maxProtectedPick - 1) {
      r.note = "Moved into protected range by Bottom-Four Protection.";
    }
  });

  return [...newTop, ...newRest];
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
  els.lotteryPickCount.value = String(safeRequested);

  const lotteryCount = Math.min(safeRequested, entries.length);
  const remaining = [...entries];
  const selected = [];

  for (let pick = 1; pick <= lotteryCount; pick += 1) {
    const eligible = remaining.filter((entry) => isEligibleForPick(entry, pick, remaining));
    const winner = weightedRandomTeam(eligible.length ? eligible : remaining, randomFn);
    if (!winner) break;

    let note = "";
    if (pick === 4 && winner.previousTopThree && els.topThreeCooldownToggle.checked) {
      note = "Top-3 cooldown applied.";
    }

    selected.push({ ...winner, pick, note });
    remaining.splice(remaining.findIndex((entry) => entry.id === winner.id), 1);
  }

  remaining.sort((a, b) => a.standingIndex - b.standingIndex);
  remaining.forEach((entry) => {
    selected.push({
      ...entry,
      pick: selected.length + 1,
      note: "Placed by reverse regular-season record.",
    });
  });

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

async function animateLottery(results) {
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
  els.statusText.textContent = "The Flockville Draft Lottery is complete.";
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

  const { randomFn, seedUsed } = getRandomSource();
  const results = runLotteryCalculation(randomFn);
  state.lastRunMeta = buildRunMeta(seedUsed);
  animateLottery(results);
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

function downloadJson() {
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
    seasonHistory: state.seasonHistory,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flockville-lottery-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resetApp() {
  if (state.isRunning) {
    showToast("Cannot reset while the lottery is running.");
    return;
  }

  if (!confirm("Reset all teams, history, and lottery results?")) return;

  state.teams = [];
  state.results = [];
  state.seasonHistory = [];
  state.setupLocked = false;
  state.seedEnabled = false;
  state.seedText = "";
  state.lastRunMeta = null;

  applySettingsToUi({});

  els.machineText.textContent = "READY";
  els.statusText.textContent = DEFAULT_STATUS;
  render();
}

function loadDemo() {
  if (isLocked()) {
    showToast("Unlock setup before loading teams.");
    return;
  }

  state.teams = [
    "Raiders", "Giants", "Titans", "Browns",
    "Jets", "Panthers", "Saints", "Patriots",
    "Bears", "Cardinals", "Colts", "Jaguars",
    "Falcons", "Seahawks", "Dolphins", "Cowboys",
  ].map((name) => ({
    id: createId(),
    name,
    owner: name,
    previousTopThree: false,
    previousNumberOne: false,
  }));

  state.teams[1].owner = "Baltimore Ravens";
  state.teams[4].previousTopThree = true;
  state.teams[7].previousNumberOne = true;

  state.results = [];
  state.lastRunMeta = null;
  render();
  showToast("Demo teams loaded.");
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

function finalizeSeason() {
  if (state.isRunning) {
    showToast("Wait for the lottery to complete before finalizing.");
    return;
  }

  if (!state.results.length) {
    showToast("Run a lottery before finalizing a season.");
    return;
  }

  if (!confirm("Finalize this season? This will archive results and set cooldown flags for next season.")) {
    return;
  }

  const topThreeIds = new Set(state.results.filter((result) => result.pick <= 3).map((result) => result.id));
  const numberOneId = state.results.find((result) => result.pick === 1)?.id || "";

  state.teams.forEach((team) => {
    team.previousTopThree = topThreeIds.has(team.id);
    team.previousNumberOne = team.id === numberOneId;
  });

  state.seasonHistory.unshift({
    id: createId(),
    finalizedAt: new Date().toISOString(),
    numberOne: state.results[0]?.team || "Unknown",
    topThree: state.results.slice(0, 3).map((result) => result.team),
    finalOrder: state.results.map((result) => ({ pick: result.pick, team: result.team, owner: result.owner })),
    seed: state.lastRunMeta?.seedEnabled ? state.lastRunMeta.seed : "",
  });

  state.seasonHistory = state.seasonHistory.slice(0, MAX_SEASON_HISTORY);
  state.results = [];
  state.lastRunMeta = null;

  els.machineText.textContent = "READY";
  els.statusText.textContent = "Season finalized. Ready to set up the next draw.";

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
    const restored = sanitizeImportedPayload(parsed);

    state.teams = restored.teams;
    state.results = restored.results;
    state.seasonHistory = restored.seasonHistory;
    state.setupLocked = restored.setupLocked;
    state.seedEnabled = restored.seedEnabled;
    state.seedText = restored.seedText;
    state.lastRunMeta = restored.lastRunMeta;

    applySettingsToUi(restored.settings);

    if (!state.results.length) {
      els.machineText.textContent = "READY";
      els.statusText.textContent = DEFAULT_STATUS;
    }

    render();
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

  state.results = [];
  state.lastRunMeta = null;
  els.statusText.textContent = DEFAULT_STATUS;
  render();
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
els.finalizeSeasonBtn.addEventListener("click", finalizeSeason);
els.copyDiscordBtn.addEventListener("click", copyDiscordResults);
els.downloadJsonBtn.addEventListener("click", downloadJson);
els.importJsonBtn.addEventListener("click", importJson);

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
  if (state.isRunning) return;
  state.seedText = normalizeName(els.seedInput.value);
  state.results = [];
  state.lastRunMeta = null;
  render();
});

restoreStateFromStorage();
els.seedEnabledToggle.checked = state.seedEnabled;
els.seedInput.value = state.seedText;
els.statusText.textContent = state.results.length ? "Previous lottery loaded from saved state." : DEFAULT_STATUS;
render();

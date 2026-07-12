const state = {
  teams: [],
  results: [],
  isRunning: false,
};

const els = {
  teamNameInput: document.getElementById("teamNameInput"),
  pickOwnerInput: document.getElementById("pickOwnerInput"),
  addTeamBtn: document.getElementById("addTeamBtn"),
  loadDemoBtn: document.getElementById("loadDemoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  teamTableBody: document.getElementById("teamTableBody"),
  lotteryPickCount: document.getElementById("lotteryPickCount"),
  bottomProtectionToggle: document.getElementById("bottomProtectionToggle"),
  topThreeCooldownToggle: document.getElementById("topThreeCooldownToggle"),
  consecutiveOneToggle: document.getElementById("consecutiveOneToggle"),
  startLotteryBtn: document.getElementById("startLotteryBtn"),
  machineText: document.getElementById("machineText"),
  machineOrb: document.querySelector(".machine-orb"),
  statusText: document.getElementById("statusText"),
  resultsGrid: document.getElementById("resultsGrid"),
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

function addTeam(name, owner = "") {
  const cleanName = name.trim();
  if (!cleanName) return;

  if (state.teams.some((team) => team.name.toLowerCase() === cleanName.toLowerCase())) {
    showToast("That team is already in the lottery.");
    return;
  }

  state.teams.push({
    id: createId(),
    name: cleanName,
    owner: owner || cleanName,
    previousTopThree: false,
    previousNumberOne: false,
  });

  state.results = [];
  render();
}

function removeTeam(id) {
  state.teams = state.teams.filter((team) => team.id !== id);
  state.results = [];
  render();
}

function moveTeam(id, direction) {
  const index = state.teams.findIndex((team) => team.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.teams.length) return;

  [state.teams[index], state.teams[nextIndex]] = [state.teams[nextIndex], state.teams[index]];
  state.results = [];
  render();
}

function updateTeam(id, field, value) {
  const team = state.teams.find((entry) => entry.id === id);
  if (!team) return;
  team[field] = value;
  state.results = [];
  renderResults();
}

function renderOwnerOptions() {
  const currentValue = els.pickOwnerInput.value;
  els.pickOwnerInput.innerHTML = '<option value="">Pick owned by same team</option>';

  state.teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.name;
    option.textContent = team.name;
    els.pickOwnerInput.appendChild(option);
  });

  if ([...els.pickOwnerInput.options].some((option) => option.value === currentValue)) {
    els.pickOwnerInput.value = currentValue;
  }
}

function renderTeams() {
  els.teamTableBody.innerHTML = "";

  state.teams.forEach((team, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <button class="remove-btn move-up" title="Move up">↑</button>
        <strong>${index + 1}</strong>
        <button class="remove-btn move-down" title="Move down">↓</button>
      </td>
      <td><input class="team-name-edit" value="${escapeHtml(team.name)}" /></td>
      <td><input class="owner-edit" value="${escapeHtml(team.owner)}" /></td>
      <td><strong>${getBallCount(index)}</strong></td>
      <td><input class="inline-check previous-top-three" type="checkbox" ${team.previousTopThree ? "checked" : ""} /></td>
      <td><input class="inline-check previous-number-one" type="checkbox" ${team.previousNumberOne ? "checked" : ""} /></td>
      <td><button class="remove-btn remove-team">Remove</button></td>
    `;

    row.querySelector(".move-up").addEventListener("click", () => moveTeam(team.id, -1));
    row.querySelector(".move-down").addEventListener("click", () => moveTeam(team.id, 1));
    row.querySelector(".remove-team").addEventListener("click", () => removeTeam(team.id));

    row.querySelector(".team-name-edit").addEventListener("change", (event) => {
      const oldName = team.name;
      const newName = event.target.value.trim() || oldName;
      team.name = newName;
      if (team.owner === oldName) team.owner = newName;
      render();
    });

    row.querySelector(".owner-edit").addEventListener("change", (event) => {
      updateTeam(team.id, "owner", event.target.value.trim() || team.name);
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
}

function render() {
  renderOwnerOptions();
  renderTeams();
  renderResults();
}

function weightedRandomTeam(eligibleTeams) {
  const weightedPool = [];

  eligibleTeams.forEach((entry) => {
    for (let i = 0; i < entry.balls; i += 1) {
      weightedPool.push(entry);
    }
  });

  if (!weightedPool.length) return null;
  return weightedPool[Math.floor(Math.random() * weightedPool.length)];
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

  for (const protectedId of protectedIds) {
    const currentIndex = results.findIndex((result) => result.id === protectedId);

    if (currentIndex > maxProtectedPick - 1) {
      const swapIndex = maxProtectedPick - 1;
      [results[currentIndex], results[swapIndex]] = [results[swapIndex], results[currentIndex]];
      results[swapIndex].note = "Moved into protected range by Bottom-Four Protection.";
    }
  }

  return results;
}

function runLotteryCalculation() {
  const entries = buildLotteryEntries();
  const requestedPicks = Number.parseInt(els.lotteryPickCount.value, 10) || 8;
  const lotteryCount = Math.min(requestedPicks, entries.length);
  const remaining = [...entries];
  const selected = [];

  for (let pick = 1; pick <= lotteryCount; pick += 1) {
    const eligible = remaining.filter((entry) => isEligibleForPick(entry, pick, remaining));
    const winner = weightedRandomTeam(eligible.length ? eligible : remaining);
    if (!winner) break;

    let note = "";
    if (pick === 4 && winner.previousTopThree && els.topThreeCooldownToggle.checked) {
      note = "Top-3 cooldown applied.";
    }

    selected.push({ ...winner, pick, note });
    remaining.splice(remaining.findIndex((entry) => entry.id === winner.id), 1);
  }

  // Remaining non-playoff teams return to reverse record order.
  remaining.sort((a, b) => a.standingIndex - b.standingIndex);
  remaining.forEach((entry, index) => {
    selected.push({
      ...entry,
      pick: selected.length + 1,
      note: "Placed by reverse regular-season record.",
    });
  });

  applyBottomFourProtection(selected, entries);

  selected.forEach((result, index) => {
    result.pick = index + 1;
  });

  return selected;
}

async function animateLottery(results) {
  state.isRunning = true;
  state.results = [];
  renderResults();

  els.startLotteryBtn.disabled = true;
  els.machineOrb.classList.add("spinning");

  for (const result of results) {
    els.statusText.textContent = `Drawing Pick #${result.pick}...`;

    const names = state.teams.map((team) => team.name);
    for (let i = 0; i < 14; i += 1) {
      els.machineText.textContent = names[Math.floor(Math.random() * names.length)];
      await wait(75 + i * 7);
    }

    els.machineText.textContent = result.team;
    state.results.push(result);
    renderResults();
    await wait(700);
  }

  els.machineOrb.classList.remove("spinning");
  els.machineText.textContent = "COMPLETE";
  els.statusText.textContent = "The Flockville Draft Lottery is complete.";
  els.startLotteryBtn.disabled = false;
  state.isRunning = false;
}

function startLottery() {
  if (state.isRunning) return;

  if (state.teams.length < 2) {
    showToast("Add at least two teams before running the lottery.");
    return;
  }

  const results = runLotteryCalculation();
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
    "*Fair. Competitive. No Tanking.*",
    "**No Cheese. Just Ball.**",
  ];

  return lines.join("\n");
}

async function copyDiscordResults() {
  await navigator.clipboard.writeText(buildDiscordText());
  showToast("Discord results copied.");
}

function downloadJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    settings: {
      lotteryPicks: Number.parseInt(els.lotteryPickCount.value, 10) || 8,
      bottomFourProtection: els.bottomProtectionToggle.checked,
      topThreeCooldown: els.topThreeCooldownToggle.checked,
      noConsecutiveNumberOne: els.consecutiveOneToggle.checked,
    },
    teams: state.teams,
    results: state.results,
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
  if (!confirm("Reset all teams and lottery results?")) return;
  state.teams = [];
  state.results = [];
  els.machineText.textContent = "READY";
  els.statusText.textContent = "Add teams, confirm the settings, and start the draw.";
  render();
}

function loadDemo() {
  state.teams = [
    "Raiders", "Giants", "Titans", "Browns",
    "Jets", "Panthers", "Saints", "Patriots",
    "Bears", "Cardinals", "Colts", "Jaguars",
    "Falcons", "Seahawks", "Dolphins", "Cowboys"
  ].map((name) => ({
    id: createId(),
    name,
    owner: name,
    previousTopThree: false,
    previousNumberOne: false,
  }));

  state.teams[1].owner = "Ravens";
  state.teams[4].previousTopThree = true;
  state.teams[7].previousNumberOne = true;
  state.results = [];
  render();
  showToast("Demo teams loaded.");
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
els.resetBtn.addEventListener("click", resetApp);
els.startLotteryBtn.addEventListener("click", startLottery);
els.copyDiscordBtn.addEventListener("click", copyDiscordResults);
els.downloadJsonBtn.addEventListener("click", downloadJson);

render();

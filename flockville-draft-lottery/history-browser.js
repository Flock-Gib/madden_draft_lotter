(function (root, factory) {
  const browser = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = browser;
  } else {
    root.historyBrowser = browser;
    const start = () => browser.init();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const PAGE_SIZE = 50;

  function parseYear(value) {
    const text = String(value ?? "").trim();
    return /^\d{4}$/.test(text) && Number(text) >= 1000 ? Number(text) : null;
  }

  function years(history) {
    return Object.keys(history || {}).filter((year) => parseYear(year) !== null)
      .sort((a, b) => Number(b) - Number(a));
  }

  function projectSeason(record, year) {
    if (!record || !Array.isArray(record.finalOrder)) return [];
    return record.finalOrder.map((entry) => {
      const slot = Number.isSafeInteger(entry.originalSlot) && entry.originalSlot > 0 ? entry.originalSlot : null;
      const pick = Number.isSafeInteger(entry.pick) && entry.pick > 0 ? entry.pick : null;
      return {
        year: String(year), archived: record.archived === true,
        team: String(entry.team || "").trim(),
        owner: String(entry.owner || entry.team || "").trim(),
        pick, originalSlot: slot, movement: slot !== null && pick !== null ? slot - pick : null,
        cpu: entry.cpuLocked === true ? "CPU / locked" : record.source === "manual" ? "Unknown" : "Not CPU-locked",
      };
    }).filter((entry) => entry.team);
  }

  function searchHistory(history, query, from = "", to = "") {
    const fromText = String(from).trim();
    const toText = String(to).trim();
    const first = fromText ? parseYear(fromText) : null;
    const last = toText ? parseYear(toText) : null;
    if ((fromText && first === null) || (toText && last === null)) {
      return { error: "Enter a four-digit year from 1000 to 9999.", rows: [] };
    }
    if (first !== null && last !== null && first > last) {
      return { error: "From year must not be later than to year.", rows: [] };
    }
    const term = String(query || "").trim().toLowerCase();
    if (!term) return { error: "", rows: [] };
    const rows = years(history).filter((year) =>
      (first === null || Number(year) >= first) && (last === null || Number(year) <= last))
      .flatMap((year) => projectSeason(history[year], year))
      .filter((entry) => entry.team.toLowerCase().includes(term));
    return { error: "", rows };
  }

  function compareSeasons(history, firstYear, secondYear) {
    const first = projectSeason(history?.[firstYear], firstYear);
    const second = projectSeason(history?.[secondYear], secondYear);
    const teams = new Map();
    first.forEach((entry) => teams.set(entry.team.toLowerCase(), { team: entry.team, first: entry, second: null }));
    second.forEach((entry) => {
      const key = entry.team.toLowerCase();
      if (!teams.has(key)) teams.set(key, { team: entry.team, first: null, second: null });
      teams.get(key).second = entry;
    });
    return [...teams.values()].sort((a, b) => a.team.localeCompare(b.team));
  }

  function init() {
    const explorer = document.getElementById("historyExplorer");
    if (!explorer || explorer.dataset.historyBrowserInitialized) return;
    const byId = (id) => document.getElementById(id);
    const query = byId("historyTeamSearch");
    const from = byId("historyFromYear");
    const to = byId("historyToYear");
    const compare = byId("historyCompareYear");
    const current = byId("historyYearSelect");
    const summary = byId("historySearchSummary");
    const results = byId("historySearchResults");
    const comparison = byId("historyComparison");
    if (![query, from, to, compare, current, summary, results, comparison].every(Boolean)) return;
    explorer.dataset.historyBrowserInitialized = "true";
    [from, to].forEach((input) => { input.min = "1000"; input.max = "9999"; input.step = "1"; });
    let limit = PAGE_SIZE;

    function seasonLabel(year) {
      return `${year}${state.lotteryHistory[year]?.archived ? " (archived)" : ""}`;
    }

    function pickDetails(row) {
      if (!row) return "Not in saved results";
      const slot = row.originalSlot === null ? "Unknown" : `#${row.originalSlot}`;
      const movement = row.movement === null ? "Unknown" : row.movement > 0
        ? `Up ${row.movement}` : row.movement < 0 ? `Down ${-row.movement}` : "No change";
      return `Pick ${row.pick === null ? "Unknown" : `#${row.pick}`}<br>Pick owner: ${escapeHtml(row.owner || "Unknown")}<br>Pre-lottery slot: ${slot}<br>Movement: ${movement}<br>${escapeHtml(row.cpu)}`;
    }

    function renderSearch() {
      const available = years(state.lotteryHistory);
      const found = searchHistory(state.lotteryHistory, query.value, from.value, to.value);
      results.innerHTML = "";
      if (found.error) {
        summary.textContent = found.error;
        return;
      }
      if (!available.length) {
        summary.textContent = "No saved seasons yet.";
        return;
      }
      if (!query.value.trim()) {
        const listed = available.slice(0, 8).map(seasonLabel).join(", ");
        const remaining = available.length > 8 ? `, and ${available.length - 8} more` : "";
        summary.textContent = `${available.length} saved season${available.length === 1 ? "" : "s"} (${listed}${remaining}). Enter an original team to search.`;
        return;
      }
      const visible = found.rows.slice(0, limit);
      summary.textContent = `${found.rows.length} match${found.rows.length === 1 ? "" : "es"}${found.rows.length > visible.length ? `; showing ${visible.length}` : ""}.`;
      if (!found.rows.length) {
        results.textContent = "No matching original teams in the selected years.";
        return;
      }
      results.innerHTML = `<div class="hub-table-wrap"><table class="odds-table"><thead><tr><th>Season</th><th>Original team</th><th>Pick owner</th><th>Pick</th><th>Pre-lottery slot</th><th>Movement</th><th>CPU status</th></tr></thead><tbody>${visible.map((row) => {
        const movement = row.movement === null ? "Unknown" : row.movement > 0 ? `Up ${row.movement}` : row.movement < 0 ? `Down ${-row.movement}` : "No change";
        return `<tr class="history-search-row"><td>${escapeHtml(seasonLabel(row.year))}</td><td>${escapeHtml(row.team)}</td><td>${escapeHtml(row.owner || "Unknown")}</td><td>${row.pick === null ? "Unknown" : `#${row.pick}`}</td><td>${row.originalSlot === null ? "Unknown" : `#${row.originalSlot}`}</td><td>${movement}</td><td>${escapeHtml(row.cpu)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
      if (visible.length < found.rows.length) {
        const button = document.createElement("button");
        button.id = "historyMoreBtn";
        button.type = "button";
        button.textContent = "Show more";
        button.addEventListener("click", () => { limit += PAGE_SIZE; renderSearch(); });
        results.appendChild(button);
      }
    }

    function renderComparison() {
      const available = years(state.lotteryHistory);
      const selected = compare.value;
      compare.innerHTML = '<option value="">Select a season</option>' + available.map((year) =>
        `<option value="${year}">${escapeHtml(seasonLabel(year))}</option>`).join("");
      compare.value = available.includes(selected) ? selected : "";
      compare.disabled = !available.length;
      if (!available.length) {
        comparison.textContent = "No saved seasons to compare.";
      } else if (!current.value) {
        comparison.textContent = "Select a season above to compare. Archived seasons may need to be shown.";
      } else if (!compare.value) {
        comparison.textContent = "Choose a comparison season.";
      } else {
        const rows = compareSeasons(state.lotteryHistory, current.value, compare.value);
        if (!rows.length) {
          comparison.textContent = "No saved team results in these seasons.";
          return;
        }
        comparison.innerHTML = `<div class="hub-table-wrap"><table class="odds-table"><thead><tr><th>Original team</th><th>${escapeHtml(seasonLabel(current.value))}</th><th>${escapeHtml(seasonLabel(compare.value))}</th></tr></thead><tbody>${rows.map((row) =>
          `<tr class="history-search-row"><th scope="row">${escapeHtml(row.team)}</th><td>${pickDetails(row.first)}</td><td>${pickDetails(row.second)}</td></tr>`).join("")}</tbody></table></div>`;
      }
    }

    const renderAll = () => { renderSearch(); renderComparison(); };
    [query, from, to].forEach((input) => input.addEventListener("input", () => { limit = PAGE_SIZE; renderSearch(); }));
    compare.addEventListener("change", renderComparison);
    current.addEventListener("change", renderComparison);
    byId("showArchivedToggle")?.addEventListener("change", renderAll);
    document.addEventListener("hub:render", renderAll);
    document.addEventListener("hub:navigate", renderAll);
    window.addEventListener("hub:render", renderAll);
    window.addEventListener("hub:navigate", renderAll);
    renderAll();
  }

  return { parseYear, years, projectSeason, searchHistory, compareSeasons, init };
});

(() => {
  const client = supabaseHistoryClient;
  const $ = (id) => document.getElementById(id);
  const correctionKey = "flockvilleHistoryCorrections";
  let dashboard = null;
  let dashboardLoaded = false;
  let pollTimer;
  let polling = false;
  let lastBroadcast = null;
  let activeBroadcast = null;
  let publishedPicks = [];
  let corrections = {};
  let auditRows = [];
  try {
    const stored = JSON.parse(localStorage.getItem(correctionKey) || "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      corrections = Object.fromEntries(Object.entries(stored).filter(([year, reason]) =>
        lotteryHistory.sanitizeYear(year) && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500));
    }
  } catch {
    showToast("Pending correction reasons could not be restored. Finalized changes will need a reason before publishing.");
  }

  function isCommissioner() {
    return !client?.isConfigured() || (client.isAuthenticated() && cloudAccessVerified);
  }

  const privateIds = [
    "deleteHistoryYearBtn", "archiveHistoryYearBtn", "importHistoryInput", "importHistoryBtn",
    "newHistoryBtn", "editHistoryBtn", "manualHistoryEditor", "loadLegacySeasonBtn",
    "finalizeSeasonBtn", "generateTradesBtn", "importJsonInput", "importJsonBtn",
    "supabasePublishBtn", "cloudRetryBtn", "dryRunPanel",
    "finalizeDialog", "flagOverrideDialog",
    "resultsGrid", "requiredTradesList", "auditSummary",
  ];
  privateIds.forEach((id) => $(id)?.classList.add("commissioner-only"));
  ["recoveryText", "saveTradeBtn", "overrideNumberOneBtn", "ruleHistoryList"].forEach((id) =>
    $(id)?.closest("section.panel")?.classList.add("commissioner-only"));

  document.addEventListener("click", (event) => {
    if (!isCommissioner() && event.target.closest(".commissioner-only")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast("Sign in as an authorized league commissioner to make changes.");
    }
  }, true);

  function render() {
    const admin = isCommissioner();
    document.body.dataset.commissioner = String(admin);
    if (!admin) ["finalizeDialog", "flagOverrideDialog"].forEach((id) => {
      if ($(id)?.open) $(id).close();
    });
    $("memberNotice").hidden = admin;
    const years = lotteryHistory.getSortedYears(state.lotteryHistory);
    const latest = state.lotteryHistory[years[0]];
    $("memberResults").hidden = admin;
    if (!admin) $("memberResults").innerHTML = latest
      ? `<h3>Latest saved lottery · ${latest.year}</h3>${pendingCloudYears.has(String(latest.year)) ? '<p class="helper-text">Browser-only changes: this result has not been confirmed in Supabase.</p>' : ""}${buildHistoryDetailMarkup(latest)}`
      : '<p class="helper-text">No saved results are available. Visit History or Watch live for updates.</p>';
    $("homeStats").innerHTML = [
      ["Current season", dashboard?.season_year || state.seasonYear],
      ["Latest saved lottery", latest ? `${latest.year} · #1 ${latest.finalOrder[0].team}` : "No history available yet"],
      ["League archive", `${years.length} saved season${years.length === 1 ? "" : "s"}`],
    ].map(([label, value]) => `<article class="hub-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    const announcements = String(dashboard?.announcements || "").split("\n").map((line) => line.trim()).filter(Boolean);
    $("homeAnnouncements").innerHTML = announcements.length
      ? `<ul>${announcements.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : '<p class="helper-text">No league announcements have been published yet.</p>';
    $("homeEvent").textContent = dashboard?.event_title
      ? `${dashboard.event_title}${dashboard.event_at ? ` · ${new Date(dashboard.event_at).toLocaleString()}` : " · Time to be announced"}`
      : "No upcoming event has been published.";
    if (!client?.isConfigured()) $("hubStatus").textContent = "Local mode: configure Supabase to share league news and live draws.";
  }

  function fillEditor() {
    $("hubSeason").value = dashboard?.season_year || state.seasonYear;
    $("hubAnnouncements").value = dashboard?.announcements || "";
    $("hubEventTitle").value = dashboard?.event_title || "";
    const date = dashboard?.event_at ? new Date(dashboard.event_at) : null;
    $("hubEventTime").value = date && Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  }

  async function loadDashboard() {
    if (!client?.isConfigured()) { render(); fillEditor(); return; }
    try {
      dashboard = await client.loadDashboard();
      dashboardLoaded = true;
      $("hubStatus").textContent = dashboard ? "League dashboard connected." : "Commissioners can publish the current season, news and next event here.";
      fillEditor();
      render();
    } catch (error) {
      $("hubStatus").textContent = `League dashboard unavailable: ${error.message} If upgrading, run the updated supabase/schema.sql. History and local data remain available.`;
    }
  }

  $("hubSaveBtn").addEventListener("click", async () => {
    if (!isCommissioner() || !client?.isConfigured()) {
      $("hubStatus").textContent = "Sign in to a configured Supabase project as a league admin to publish.";
      return;
    }
    const year = lotteryHistory.sanitizeYear($("hubSeason").value);
    const title = $("hubEventTitle").value.trim();
    const time = $("hubEventTime").value;
    if (!year || (time && (!title || !Number.isFinite(Date.parse(time))))) {
      $("hubStatus").textContent = "Choose a valid season and give any scheduled event a title and valid time.";
      return;
    }
    $("hubSaveBtn").disabled = true;
    try {
      dashboard = await client.saveDashboard({
        season_year: year, announcements: $("hubAnnouncements").value.trim(),
        event_title: title, event_at: time ? new Date(time).toISOString() : null,
      });
      dashboardLoaded = true;
      render();
      $("hubStatus").textContent = "League dashboard saved to Supabase and confirmed.";
    } catch (error) {
      $("hubStatus").textContent = `Dashboard not confirmed: ${error.message}`;
    } finally { $("hubSaveBtn").disabled = false; }
  });

  function renderBroadcast(room) {
    if (!room) {
      $("liveStatus").textContent = "No broadcast yet. The commissioner can enable Broadcast this draw live before starting a lottery.";
      $("liveWinner").textContent = "Draft night is coming.";
      $("livePicks").replaceChildren();
      return;
    }
    if (!Array.isArray(room.picks) || !["live", "complete", "interrupted"].includes(room.status) ||
      !Number.isInteger(room.total) || room.total < 2 || room.total > 64 ||
      !Number.isFinite(Date.parse(room.updated_at)) ||
      !Number.isInteger(room.revision) || room.revision < 1 ||
      (room.status === "complete" && room.picks.length !== room.total) ||
      room.picks.length > room.total || room.picks.some((pick, index) =>
        pick.pick !== index + 1 || typeof pick.team !== "string" || typeof pick.owner !== "string")) {
      throw new Error("The broadcast response is invalid. No results were displayed.");
    }
    const stale = room.status === "live" && Date.now() - Date.parse(room.updated_at) > 90000;
    $("liveStatus").textContent = `${room.season_year} · ${room.picks.length} of ${room.total} picks revealed · ${
      stale ? "Broadcast paused or disconnected" : room.status === "complete" ? "Complete" : room.status === "interrupted" ? "Interrupted — not a completed lottery" : "Live"
    } · Last update ${formatTime(room.updated_at)}`;
    const winner = room.picks.at(-1);
    $("liveWinner").textContent = winner
      ? `#${winner.pick} · ${winner.team}${winner.cpuLocked ? " · CPU / locked" : ""}${winner.owner !== winner.team ? ` → ${winner.owner}` : ""}`
      : "Waiting for the first reveal…";
    $("livePicks").innerHTML = room.picks.map((pick) =>
      `<li><strong>#${pick.pick} · ${escapeHtml(pick.team)}</strong>${pick.cpuLocked ? " · CPU / locked" : ""}<span>Pick owner: ${escapeHtml(pick.owner)}</span></li>`).join("");
  }

  async function pollBroadcast() {
    if (polling || document.body.dataset.page !== "live" || document.hidden) return;
    if (!client?.isConfigured()) {
      $("liveStatus").textContent = "Configure Supabase to watch shared live draws.";
      return;
    }
    polling = true;
    try {
      const room = await client.loadBroadcast();
      if (!lastBroadcast || !room || Number(room.revision) >= Number(lastBroadcast.revision)) {
        renderBroadcast(room);
        lastBroadcast = room;
      }
    } catch (error) {
      $("liveStatus").textContent = `Broadcast connection failed: ${error.message} Retrying in two seconds; any displayed picks are the last received update.`;
    } finally {
      polling = false;
      clearTimeout(pollTimer);
      if (document.body.dataset.page === "live" && !document.hidden) pollTimer = setTimeout(pollBroadcast, 2000);
    }
  }

  async function startBroadcast(year, total) {
    activeBroadcast = null;
    publishedPicks = [];
    if (!$("broadcastEnabled").checked) return;
    if (!canPublishToCloud()) throw new Error("Verify commissioner access and resolve cloud conflicts before broadcasting.");
    const broadcast = { p_run_id: crypto.randomUUID(), p_year: year, p_total: total };
    await client.publishBroadcast({ ...broadcast, p_status: "live", p_picks: [], p_start: true });
    activeBroadcast = broadcast;
    $("broadcastStatus").textContent = "Broadcast live. Share the Watch live page; only revealed picks are transmitted.";
  }

  async function revealBroadcast(results, status = "live") {
    if (!activeBroadcast) return;
    try {
      const picks = status === "interrupted" ? publishedPicks
        : results.map(({ pick, team, owner, cpuLocked }) => ({ pick, team, owner, cpuLocked: Boolean(cpuLocked) }));
      await client.publishBroadcast({
        ...activeBroadcast, p_status: status, p_start: false,
        p_picks: picks,
      });
      publishedPicks = picks;
      if (status !== "live") {
        activeBroadcast = null;
        $("broadcastStatus").textContent = status === "complete" ? "Broadcast complete." : "Broadcast interrupted.";
      }
    } catch (error) {
      activeBroadcast = null;
      $("broadcastStatus").textContent = `Broadcast disconnected: ${error.message} The local lottery continues and saves separately. Spectators may see an incomplete broadcast.`;
      showToast("Live broadcast disconnected. Check the broadcast status; your local lottery is continuing.");
    }
  }

  $("liveFullscreenBtn").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("live").requestFullscreen) await $("live").requestFullscreen();
      else throw new Error("Fullscreen is unavailable in this browser. Use your browser's fullscreen or screen-sharing controls.");
    } catch (error) { $("liveStatus").textContent = error.message; }
  });

  function saveCorrections() {
    try { localStorage.setItem(correctionKey, JSON.stringify(corrections)); }
    catch { showToast("Could not retain correction reasons. Export a backup before leaving this page."); }
  }

  function authorizeFinalized(year, action, original = state.lotteryHistory[year]) {
    if (!original?.finalized) return true;
    const reason = prompt(`${year} is finalized. ${action} requires an explicit correction. Explain why (8–500 characters). Cancel leaves it unchanged.`);
    if (!reason || reason.trim().length < 8 || reason.trim().length > 500) {
      showToast("Finalized lottery unchanged. A correction reason of 8–500 characters is required.");
      return false;
    }
    corrections[year] = reason.trim();
    saveCorrections();
    return true;
  }

  function authorizeChanges(previous, next) {
    for (const year of lotteryHistory.changedYears(previous, next)) {
      if (previous[year]?.finalized &&
        lotteryHistory.changedYears({ [year]: { ...previous[year], archived: false } },
          { [year]: { ...next[year], archived: false } }).length &&
        !corrections[year] && !authorizeFinalized(year, "Changing this result")) return false;
    }
    return true;
  }

  $("hubAuditLoadBtn").addEventListener("click", () => loadAudit());
  async function loadAudit(beforeId) {
    if (!cloudAccessVerified) {
      $("hubAuditStatus").textContent = "Configure Supabase and sign in as a verified commissioner to load database backups.";
      return;
    }
    try {
      const rows = await client.loadAudit(beforeId);
      auditRows = beforeId ? [...auditRows, ...rows] : rows;
      $("hubAuditStatus").textContent = `${auditRows.length} database revisions loaded. Backups include the complete record before and after each change.`;
      $("hubAuditLog").innerHTML = auditRows.map((row, index) =>
        `<article class="hub-card"><strong>${row.season_year} · ${escapeHtml(row.action)}</strong><p>${escapeHtml(formatTime(row.created_at))} · ${escapeHtml(row.reason)}</p><button class="button secondary" data-backup="${index}">Download revision ${escapeHtml(row.id)}</button></article>`).join("") +
        (rows.length === 50 ? '<button class="button secondary" data-more-audit>Load older revisions</button>' : "");
    } catch (error) { $("hubAuditStatus").textContent = `Could not load backups: ${error.message}`; }
  }
  $("hubAuditLog").addEventListener("click", (event) => {
    const backup = event.target.closest("[data-backup]");
    if (backup) {
      const row = auditRows[Number(backup.dataset.backup)];
      const record = row.before_record || row.after_record;
      if (record) downloadChecksummedJson(`flockville-${row.season_year}-revision-${row.id}.json`, {
        ...lotteryHistory.buildHistoryExport({ [row.season_year]: record }),
        revision: { id: row.id, action: row.action, reason: row.reason, createdAt: row.created_at },
      }).catch((error) => { $("hubAuditStatus").textContent = error.message; });
    }
    if (event.target.closest("[data-more-audit]")) loadAudit(auditRows.at(-1)?.id);
  });

  globalThis.flockvilleHub = {
    render, isCommissioner, startBroadcast, revealBroadcast, authorizeFinalized, authorizeChanges,
    correctionReasons: () => ({ ...corrections }),
    confirmCorrections: (years) => {
      years.forEach((year) => { delete corrections[year]; });
      saveCorrections();
    },
  };
  window.addEventListener("hub:render", render);
  window.addEventListener("hub:navigate", () => {
    clearTimeout(pollTimer);
    if (document.body.dataset.page === "live") pollBroadcast();
    if (document.body.dataset.page === "home" && !dashboardLoaded) loadDashboard();
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(pollTimer);
    if (!document.hidden) pollBroadcast();
  });
  render();
  loadDashboard();
  pollBroadcast();
})();

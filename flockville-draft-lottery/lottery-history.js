(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.lotteryHistory = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const HISTORY_EXPORT_TYPE = "flockville-lottery-history";
  const HISTORY_SCHEMA_VERSION = 1;
  const MIN_YEAR = 1000;
  const MAX_YEAR = 9999;

  function normalizeName(value) {
    return String(value || "").trim();
  }

  function toNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function sanitizeYear(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) return null;
    return parsed;
  }

  function sanitizeOrderEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const pick = Number.parseInt(entry.pick, 10);
    const team = normalizeName(entry.team);
    if (!Number.isFinite(pick) || pick < 1 || !team) return null;
    const originalSlot = Number.parseInt(entry.originalSlot, 10);
    const safeOriginal = Number.isFinite(originalSlot) && originalSlot > 0 ? originalSlot : null;
    return {
      pick,
      team,
      owner: normalizeName(entry.owner) || team,
      originalSlot: safeOriginal,
      movement: safeOriginal === null ? 0 : safeOriginal - pick,
      balls: toNumber(entry.balls, 0),
      note: normalizeName(entry.note),
    };
  }

  function sanitizeOddsEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const team = normalizeName(entry.team);
    if (!team) return null;
    return {
      slot: toNumber(entry.slot, 0),
      team,
      owner: normalizeName(entry.owner) || team,
      balls: toNumber(entry.balls, 0),
      percent: toNumber(entry.percent, 0),
    };
  }

  function sanitizeTradeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const fromTeam = normalizeName(entry.fromTeam);
    const toTeam = normalizeName(entry.toTeam);
    const sendPick = Number.parseInt(entry.sendPick, 10);
    const receivePick = Number.parseInt(entry.receivePick, 10);
    if (!fromTeam || !toTeam || !Number.isFinite(sendPick) || !Number.isFinite(receivePick)) return null;
    return {
      fromTeam,
      toTeam,
      sendPick,
      sendPickVia: normalizeName(entry.sendPickVia),
      receivePick,
      receivePickVia: normalizeName(entry.receivePickVia),
      summary:
        normalizeName(entry.summary) ||
        `${fromTeam} sends Pick #${sendPick} to ${toTeam} for Pick #${receivePick}`,
    };
  }

  function sanitizeRecord(record, fallbackYear) {
    if (!record || typeof record !== "object") return null;
    const year = sanitizeYear(record.year ?? fallbackYear);
    if (year === null) return null;

    const finalOrder = Array.isArray(record.finalOrder)
      ? record.finalOrder.map(sanitizeOrderEntry).filter(Boolean).sort((a, b) => a.pick - b.pick)
      : [];
    if (!finalOrder.length) return null;

    const settings = record.settings && typeof record.settings === "object" ? record.settings : {};

    return {
      year,
      runAt: normalizeName(record.runAt) || normalizeName(record.savedAt) || "",
      savedAt: normalizeName(record.savedAt) || normalizeName(record.runAt) || "",
      finalOrder,
      odds: Array.isArray(record.odds) ? record.odds.map(sanitizeOddsEntry).filter(Boolean) : [],
      totalBalls: toNumber(record.totalBalls, 0),
      trades: Array.isArray(record.trades) ? record.trades.map(sanitizeTradeEntry).filter(Boolean) : [],
      settings: {
        lotteryPickCount: toNumber(settings.lotteryPickCount, 8),
        bottomFourProtection: settings.bottomFourProtection ?? true,
        topThreeCooldown: settings.topThreeCooldown ?? true,
        noConsecutiveNumberOne: settings.noConsecutiveNumberOne ?? true,
      },
      seed: normalizeName(record.seed),
      ruleVersionId: normalizeName(record.ruleVersionId),
    };
  }

  function sanitizeHistory(value) {
    const history = {};
    if (!value || typeof value !== "object") return history;

    const entries = Array.isArray(value)
      ? value.map((record) => [record?.year, record])
      : Object.entries(value);

    entries.forEach(([key, record]) => {
      const safe = sanitizeRecord(record, key);
      if (safe) history[String(safe.year)] = safe;
    });

    return history;
  }

  function getSortedYears(history) {
    return Object.keys(history || {})
      .map((year) => Number.parseInt(year, 10))
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
  }

  function upsertRecord(history, record) {
    const safe = sanitizeRecord(record);
    if (!safe) return { ...history };
    return { ...history, [String(safe.year)]: safe };
  }

  function removeYear(history, year) {
    const next = { ...history };
    delete next[String(year)];
    return next;
  }

  function extractHistoryFromPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    if (payload.lotteryHistory) return sanitizeHistory(payload.lotteryHistory);
    if (sanitizeYear(payload.year) !== null && Array.isArray(payload.finalOrder)) {
      return sanitizeHistory([payload]);
    }
    return {};
  }

  function mergeHistory(existing, incoming, { replaceConflicts = true } = {}) {
    const merged = { ...existing };
    const conflicts = [];
    const added = [];

    Object.entries(incoming || {}).forEach(([year, record]) => {
      if (merged[year]) {
        conflicts.push(Number(year));
        if (!replaceConflicts) return;
      } else {
        added.push(Number(year));
      }
      merged[year] = record;
    });

    return { merged, conflicts, added };
  }

  function buildHistoryExport(history, exportedAt = new Date().toISOString()) {
    return {
      type: HISTORY_EXPORT_TYPE,
      schemaVersion: HISTORY_SCHEMA_VERSION,
      exportedAt,
      lotteryHistory: history,
    };
  }

  return {
    HISTORY_EXPORT_TYPE,
    buildHistoryExport,
    extractHistoryFromPayload,
    getSortedYears,
    mergeHistory,
    removeYear,
    sanitizeHistory,
    sanitizeRecord,
    sanitizeYear,
    upsertRecord,
  };
});

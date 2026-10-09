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
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d{4}$/.test(value.trim()))) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) return null;
    return parsed;
  }

  function positiveInteger(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function optionalNumber(value) {
    return value === null || value === undefined || (typeof value === "string" && !value.trim()) ? null : toNumber(value);
  }

  function sanitizeOrderEntry(entry, manual = false) {
    if (!entry || typeof entry !== "object") return null;
    const pick = positiveInteger(entry.pick);
    const team = typeof entry.team === "string" ? entry.team.trim() : "";
    if (pick === null || !team || (entry.owner != null && typeof entry.owner !== "string")) return null;
    const safeOriginal = positiveInteger(entry.originalSlot);
    return {
      pick,
      team,
      owner: normalizeName(entry.owner) || team,
      originalSlot: safeOriginal,
      movement: safeOriginal === null ? (manual ? null : 0) : safeOriginal - pick,
      balls: manual ? optionalNumber(entry.balls) : toNumber(entry.balls, 0),
      note: normalizeName(entry.note),
    };
  }

  function sanitizeOrder(order, manual = false) {
    if (!Array.isArray(order) || !order.length) return null;
    const entries = Array.from(order, (entry) => sanitizeOrderEntry(entry, manual));
    if (entries.some((entry) => !entry)) return null;
    entries.sort((a, b) => a.pick - b.pick);
    const names = new Set();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const name = entry.team.toLowerCase();
      if (entry.pick !== index + 1 || names.has(name)) return null;
      names.add(name);
    }
    return entries;
  }

  function sanitizeOddsEntry(entry, manual = false) {
    if (!entry || typeof entry !== "object") return null;
    const team = normalizeName(entry.team);
    if (!team) return null;
    return {
      slot: manual ? optionalNumber(entry.slot) : toNumber(entry.slot, 0),
      team,
      owner: normalizeName(entry.owner) || team,
      balls: manual ? optionalNumber(entry.balls) : toNumber(entry.balls, 0),
      percent: manual ? optionalNumber(entry.percent) : toNumber(entry.percent, 0),
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

    const manual = record.source === "manual";
    const completeness = manual ? record.completeness : (record.completeness ?? "complete");
    if (!["complete", "top-three"].includes(completeness)) return null;
    const finalOrder = sanitizeOrder(record.finalOrder, manual);
    if (!finalOrder || (completeness === "top-three" && finalOrder.length !== 3)) return null;

    const settings = record.settings && typeof record.settings === "object" ? record.settings : {};

    return {
      year,
      ...(record.source !== undefined ? { source: record.source } : {}),
      ...(manual || record.completeness !== undefined ? { completeness } : {}),
      runAt: normalizeName(record.runAt) || (manual ? "" : normalizeName(record.savedAt)),
      savedAt: normalizeName(record.savedAt) || (manual ? "" : normalizeName(record.runAt)),
      finalOrder,
      odds: Array.isArray(record.odds) ? record.odds.map((entry) => sanitizeOddsEntry(entry, manual)).filter(Boolean) : [],
      totalBalls: manual ? optionalNumber(record.totalBalls) : toNumber(record.totalBalls, 0),
      trades: Array.isArray(record.trades) ? record.trades.map(sanitizeTradeEntry).filter(Boolean) : [],
      settings: manual ? (record.settings && typeof record.settings === "object" ? { ...record.settings } : null) : {
        lotteryPickCount: toNumber(settings.lotteryPickCount, 8),
        bottomFourProtection: settings.bottomFourProtection ?? true,
        topThreeCooldown: settings.topThreeCooldown ?? true,
        noConsecutiveNumberOne: settings.noConsecutiveNumberOne ?? true,
      },
      seed: normalizeName(record.seed),
      ruleVersionId: normalizeName(record.ruleVersionId),
    };
  }

  function createManualRecord({ year, finalOrder, completeness } = {}, existingRecord, savedAt = new Date().toISOString()) {
    const safeYear = sanitizeYear(year);
    if (safeYear === null) throw new Error("Year must be an integer from 1000 to 9999.");
    if (!["complete", "top-three"].includes(completeness)) {
      throw new Error("Completeness must be complete or top-three.");
    }
    const order = sanitizeOrder(finalOrder, true);
    if (!order) throw new Error("Final order must contain contiguous picks 1 through N and unique, nonempty original team names.");
    if (completeness === "top-three" && order.length !== 3) {
      throw new Error("Top-three records must contain exactly three picks.");
    }
    const existing = sanitizeRecord(existingRecord);
    const prior = existing?.year === safeYear ? existing : null;
    const samePick = (a, b) => a && b && a.pick === b.pick &&
      a.team.toLowerCase() === b.team.toLowerCase() && a.owner.toLowerCase() === b.owner.toLowerCase();
    const unchanged = prior && prior.finalOrder.length === order.length &&
      order.every((entry, index) => samePick(entry, prior.finalOrder[index]));
    const mergedOrder = order.map((entry, index) => {
      const previous = prior?.finalOrder[index];
      return samePick(entry, previous) ? { ...previous, ...entry,
        originalSlot: previous.originalSlot,
        movement: previous.movement,
        balls: previous.balls,
        note: previous.note,
      } : entry;
    });
    return sanitizeRecord({
      ...(prior || {}),
      year: safeYear,
      source: "manual",
      completeness,
      savedAt,
      finalOrder: mergedOrder,
      ...(!unchanged ? { odds: [], trades: [], totalBalls: null, seed: "" } : {}),
    });
  }

  function deriveProtection(teams, history, year, useManual = false) {
    const safeYear = sanitizeYear(year);
    const priorYear = safeYear === null ? null : safeYear - 1;
    const record = priorYear === null ? null : sanitizeRecord(history?.[String(priorYear)], priorYear);
    const prior = record?.year === priorYear ? record : null;
    const automatic = Boolean(prior && !useManual);
    const picks = new Map(automatic ? prior.finalOrder.map((entry) => [entry.team.toLowerCase(), entry.pick]) : []);
    return {
      teams: teams.map((team) => {
        const clone = { ...team };
        if (automatic) {
          const pick = picks.get(normalizeName(team.name).toLowerCase());
          clone.previousTopThree = pick !== undefined && pick <= 3;
          clone.previousNumberOne = pick === 1;
        }
        return clone;
      }),
      priorYear,
      record: prior,
      automatic,
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
      .map(sanitizeYear)
      .filter((year) => year !== null)
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
    createManualRecord,
    deriveProtection,
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

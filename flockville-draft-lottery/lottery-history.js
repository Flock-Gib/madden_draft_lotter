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
      ...(entry.cpuLocked === true ? { cpuLocked: true } : {}),
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
      ...(entry.cpuLocked === true ? { cpuLocked: true } : {}),
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

  /** Preserve reviewed app trades without inventing identifiers or pick assets. */
  function sanitizeReviewedTrade(entry) {
    if (!entry || typeof entry !== "object") return null;
    const fromTeam = typeof (entry.fromTeam || entry.from) === "string" ? (entry.fromTeam || entry.from).trim() : "";
    const toTeam = typeof (entry.toTeam || entry.to) === "string" ? (entry.toTeam || entry.to).trim() : "";
    const assets = (Array.isArray(entry.assets) ? entry.assets :
      typeof entry.assets === "string" ? entry.assets.split("\n") : [])
      .filter((asset) => typeof asset === "string").map((asset) => asset.trim()).filter(Boolean);
    const notes = typeof entry.notes === "string" ? entry.notes.trim() : "";
    if (!fromTeam || !toTeam || (!assets.length && !notes)) return null;
    return {
      id: typeof entry.id === "string" ? entry.id.trim() : "",
      fromTeam, toTeam, assets, notes,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt.trim() : "",
      source: entry.source === "auto" ? "auto" : "manual",
    };
  }

  /** Copy optional simulation team snapshots with only recognized record metrics. */
  function sanitizeTeamSnapshot(team) {
    if (!team || typeof team !== "object" || typeof team.name !== "string" || !team.name.trim()) return null;
    const name = team.name.trim();
    const metric = (value) => typeof value === "number" || typeof value === "string" ? optionalNumber(value) : null;
    const headToHead = {};
    if (team.headToHead && typeof team.headToHead === "object" && !Array.isArray(team.headToHead)) {
      Object.entries(team.headToHead).forEach(([key, value]) => {
        if (["__proto__", "constructor", "prototype"].includes(key)) return;
        const differential = metric(value);
        if (differential !== null) {
          headToHead[key] = differential;
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
          const fields = Object.fromEntries(["aWins", "bWins", "wins", "losses"]
            .map((field) => [field, metric(value[field])]).filter(([, number]) => number !== null));
          if (Object.keys(fields).length) headToHead[key] = fields;
        }
      });
    }
    return {
      id: typeof team.id === "string" ? team.id.trim() : "",
      name,
      owner: typeof team.owner === "string" && team.owner.trim() ? team.owner.trim() : name,
      previousTopThree: team.previousTopThree === true,
      previousNumberOne: team.previousNumberOne === true,
      winPct: metric(team.winPct),
      sos: metric(team.sos),
      headToHead,
      ...(team.cpuLocked === true ? { cpuLocked: true } : {}),
    };
  }

  /** Sanitize a year record, preserving optional archive and trade-review metadata. */
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
      ...(typeof record.archived === "boolean" ? { archived: record.archived } : {}),
      ...(typeof record.finalized === "boolean" ? { finalized: record.finalized } : {}),
      ...(Array.isArray(record.reviewedTrades) ? {
        reviewedTrades: record.reviewedTrades.map(sanitizeReviewedTrade).filter(Boolean),
      } : {}),
      ...(Array.isArray(record.teams) ? { teams: record.teams.map(sanitizeTeamSnapshot).filter(Boolean) } : {}),
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

  /** Years in `next` whose saved record is new or different from `previous`. */
  function changedYears(previous, next) {
    return Object.keys(next || {}).filter((year) => {
      const before = previous?.[year];
      return !before || stableStringify(before) !== stableStringify(next[year]);
    });
  }

  function stableStringify(value) {
    const sort = (item) => {
      if (Array.isArray(item)) return item.map(sort);
      if (item && typeof item === "object") {
        return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
      }
      return item;
    };
    return JSON.stringify(sort(value));
  }

  const FLAG_LABELS = { previousTopThree: "previous top three", previousNumberOne: "previous #1" };

  function similarTeamName(name, candidates) {
    const key = normalizeName(name).toLowerCase();
    return candidates.find((candidate) => {
      const other = candidate.toLowerCase();
      return other !== key && (other.endsWith(` ${key}`) || key.endsWith(` ${other}`));
    }) || "";
  }

  /**
   * Cross-check every checkbox variable (previous top three, previous #1, CPU / locked)
   * for the loaded teams against the saved lottery history for the prior season.
   */
  function crossCheckTeams(teams, history, year, { useManual = false, overrides = {}, enforce = {} } = {}) {
    const safeYear = sanitizeYear(year);
    const priorYear = safeYear === null ? null : safeYear - 1;
    const roster = Array.isArray(teams) ? teams : [];
    const issues = [];
    const add = (level, code, message, team = "") => issues.push({ level, code, team, message });
    const flags = ["previousTopThree", "previousNumberOne"];
    const manualFlags = Object.fromEntries(flags.map((flag) => [flag, useManual || Array.isArray(overrides?.[flag])]));
    const result = (extra) => ({ year: safeYear, priorYear, checked: roster.length, issues, ok: !issues.some((issue) => issue.level !== "info"), ...extra });
    if (!roster.length) return result({ source: "none", teams: [] });

    const derived = deriveProtection(roster, history, safeYear, useManual);
    const effective = derived.teams.map((team) => {
      const copy = { ...team };
      flags.forEach((flag) => {
        if (Array.isArray(overrides?.[flag])) {
          copy[flag] = overrides[flag].some((name) => normalizeName(name).toLowerCase() === normalizeName(team.name).toLowerCase());
        }
      });
      return copy;
    });
    const prior = derived.record;
    const needed = enforce.topThreeCooldown !== false || enforce.noConsecutiveNumberOne !== false;

    if (!prior) {
      add(needed ? "warning" : "info", "missing-history",
        `No ${priorYear} lottery is saved, so the previous top-three and previous #1 boxes cannot be verified against history.`);
    } else {
      const names = new Set(roster.map((team) => normalizeName(team.name).toLowerCase()));
      roster.forEach((team, index) => {
        const pick = prior.finalOrder.find((entry) => entry.team.toLowerCase() === normalizeName(team.name).toLowerCase())?.pick;
        const expected = { previousTopThree: pick !== undefined && pick <= 3, previousNumberOne: pick === 1 };
        flags.forEach((flag) => {
          const checked = manualFlags[flag]
            ? Boolean(effective[index][flag])
            : Boolean(team[flag]);
          if (checked === expected[flag]) return;
          if (manualFlags[flag]) {
            add("warning", "manual-flag-differs",
              `${team.name}: ${FLAG_LABELS[flag]} is ${checked ? "checked" : "unchecked"}, but ${priorYear} history says ${expected[flag] ? "yes" : "no"}. Your manual choice is being used.`, team.name);
          } else if (team[flag]) {
            add("warning", "flag-corrected",
              `${team.name}: loaded ${FLAG_LABELS[flag]} was checked, but ${priorYear} history says no. The history value is used.`, team.name);
          } else {
            add("info", "flag-applied",
              `${team.name}: ${priorYear} history marks ${FLAG_LABELS[flag]}, so that restriction was applied automatically.`, team.name);
          }
        });
      });
      const candidates = roster.map((team) => normalizeName(team.name));
      prior.finalOrder.filter((entry) => entry.pick <= 3).forEach((entry) => {
        if (names.has(entry.team.toLowerCase())) return;
        const similar = similarTeamName(entry.team, candidates);
        add("warning", "name-mismatch",
          `${priorYear} pick #${entry.pick} (${entry.team}) is not in the loaded teams, so its restriction cannot apply.${similar ? ` Did you mean ${similar}? Team names must match exactly.` : ""}`, entry.team);
      });
    }

    const numberOne = effective.filter((team) => team.previousNumberOne);
    const topThree = effective.filter((team) => team.previousTopThree);
    if (numberOne.length > 1) add("warning", "too-many-number-one", `${numberOne.length} teams are marked previous #1 (${numberOne.map((team) => team.name).join(", ")}); only one team can have held pick #1.`);
    if (topThree.length > 3) add("warning", "too-many-top-three", `${topThree.length} teams are marked previous top three; only three teams can have held picks #1 to #3.`);
    numberOne.filter((team) => !team.previousTopThree).forEach((team) => add("warning", "number-one-not-top-three", `${team.name} is marked previous #1 but not previous top three.`, team.name));

    const locked = effective.filter((team) => team.cpuLocked);
    if (locked.length === effective.length) {
      add("info", "all-locked", "Every team is CPU / locked: no lottery balls are needed and every team keeps its slot.");
    }
    locked.filter((team) => team.previousNumberOne || team.previousTopThree).forEach((team) => {
      add("info", "cpu-override",
        `${team.name} is CPU / locked, so its ${team.previousNumberOne ? "previous #1" : "top-three cooldown"} restriction is overridden; it keeps its slot.`, team.name);
    });

    return result({
      source: prior ? (useManual ? "manual" : "history") : "none",
      teams: effective,
      lockedCount: locked.length,
    });
  }

  function summarizeCrossCheck(report) {
    if (!report.checked) return "";
    const problems = report.issues.filter((issue) => issue.level !== "info").length;
    const basis = report.source === "none" ? "" : ` against ${report.priorYear} history`;
    return problems
      ? `Cross-check found ${problems} item${problems === 1 ? "" : "s"} to review across ${report.checked} team${report.checked === 1 ? "" : "s"}${basis}.`
      : `Cross-check passed: ${report.checked} team${report.checked === 1 ? "" : "s"} verified${basis}.`;
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
    changedYears,
    crossCheckTeams,
    summarizeCrossCheck,
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

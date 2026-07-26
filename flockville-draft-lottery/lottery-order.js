(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.lotteryOrder = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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

  function getRecordMetric(entry) {
    const winPct = toFiniteNumber(entry?.winPct);
    if (winPct !== null) return { value: winPct, source: "winPct" };

    const standingIndex = toFiniteNumber(entry?.standingIndex);
    if (standingIndex !== null) return { value: standingIndex, source: "standingIndex" };

    return { value: 0, source: "fallback" };
  }

  function getEntryKey(entry) {
    const id = normalizeName(entry?.id);
    if (id) return id;
    const name = normalizeName(entry?.name);
    if (name) return name.toLowerCase();
    const standingIndex = toFiniteNumber(entry?.standingIndex);
    if (standingIndex !== null) return `standing-${standingIndex}`;
    return "unknown";
  }

  function hash32(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function deterministicCoinFlip(a, b, seed = "") {
    const aKey = getEntryKey(a);
    const bKey = getEntryKey(b);
    if (aKey === bKey) return 0;

    const pair = [aKey, bKey].sort();
    const hash = hash32(`${normalizeName(seed) || "flockville-tiebreak"}:${pair[0]}|${pair[1]}`);
    const firstBeforeSecond = (hash & 1) === 0;
    const aBefore = pair[0] === aKey ? firstBeforeSecond : !firstBeforeSecond;
    return aBefore ? -1 : 1;
  }

  function parseHeadToHeadRecord(record) {
    if (!record || typeof record !== "object") return null;
    const aWins = toFiniteNumber(record.aWins ?? record.wins);
    const bWins = toFiniteNumber(record.bWins ?? record.losses);
    if (aWins === null || bWins === null) return null;
    return { aWins, bWins };
  }

  function getContextHeadToHeadEdge(a, b, headToHeadMap = {}) {
    if (!headToHeadMap || typeof headToHeadMap !== "object") return 0;
    const keysA = [normalizeName(a?.id), normalizeName(a?.name), normalizeName(a?.name).toLowerCase()].filter(Boolean);
    const keysB = [normalizeName(b?.id), normalizeName(b?.name), normalizeName(b?.name).toLowerCase()].filter(Boolean);

    for (const keyA of keysA) {
      for (const keyB of keysB) {
        const pair = [keyA, keyB].sort().join("|");
        const rec = parseHeadToHeadRecord(headToHeadMap[pair]);
        if (!rec) continue;
        const aIsFirst = pair.split("|")[0] === keyA;
        const aWins = aIsFirst ? rec.aWins : rec.bWins;
        const bWins = aIsFirst ? rec.bWins : rec.aWins;
        if (aWins === bWins) return 0;
        return aWins > bWins ? 1 : -1;
      }
    }

    return 0;
  }

  function getDirectHeadToHeadEdge(a, b) {
    const direct = a?.headToHead;
    if (!direct || typeof direct !== "object") return 0;
    const bKeys = [normalizeName(b?.id), normalizeName(b?.name), normalizeName(b?.name).toLowerCase()].filter(Boolean);

    for (const key of bKeys) {
      const record = direct[key];
      const parsed = parseHeadToHeadRecord(record);
      if (parsed) {
        if (parsed.aWins === parsed.bWins) return 0;
        return parsed.aWins > parsed.bWins ? 1 : -1;
      }

      const differential = toFiniteNumber(record);
      if (differential === null || differential === 0) continue;
      return differential > 0 ? 1 : -1;
    }
    return 0;
  }

  function compareLotteryEntries(a, b, context = {}) {
    const recordA = getRecordMetric(a);
    const recordB = getRecordMetric(b);
    if (recordA.value !== recordB.value) return recordA.value - recordB.value;

    const sosA = toFiniteNumber(a?.sos);
    const sosB = toFiniteNumber(b?.sos);
    if (sosA !== null && sosB !== null && sosA !== sosB) return sosA - sosB;

    const contextHeadToHeadEdge = getContextHeadToHeadEdge(a, b, context.headToHead);
    if (contextHeadToHeadEdge !== 0) return contextHeadToHeadEdge;

    const directHeadToHeadEdge = getDirectHeadToHeadEdge(a, b);
    if (directHeadToHeadEdge !== 0) return directHeadToHeadEdge;

    if (recordA.source === "standingIndex" && recordB.source === "standingIndex") {
      const standingA = toFiniteNumber(a?.standingIndex) ?? 0;
      const standingB = toFiniteNumber(b?.standingIndex) ?? 0;
      if (standingA !== standingB) return standingA - standingB;
    }

    return deterministicCoinFlip(a, b, context.seed);
  }

  function orderLotteryEntries(entries, context = {}) {
    if (!Array.isArray(entries)) return [];
    return [...entries].sort((a, b) => compareLotteryEntries(a, b, context));
  }

  return {
    compareLotteryEntries,
    deterministicCoinFlip,
    orderLotteryEntries,
  };
});

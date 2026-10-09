(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.lotteryTrades = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function normalizeName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toSlot(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function getOriginalSlot(result) {
    if (result?.originalSlot !== undefined) return toSlot(result.originalSlot);
    const value = result?.standingIndex;
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const standingIndex = Number(value);
    return Number.isInteger(standingIndex) && standingIndex >= 0 ? standingIndex + 1 : null;
  }

  function formatTradeSummary(trade) {
    return `${trade.fromTeam} sends Pick #${trade.sendPick} to ${trade.toTeam} for Pick #${trade.receivePick}`;
  }

  /**
   * Computes the pick swaps needed to turn the pre-lottery draft order
   * (slot N belongs to the team that finished Nth-worst, held by that pick's
   * current owner) into the post-lottery order.
   *
   * Each result needs: pick (post-lottery slot), team (original team),
   * owner (current owner of that team's pick) and originalSlot or standingIndex
   * (pre-lottery slot, 1-based / 0-based respectively).
   *
   * Pick and original slots must each cover 1..N, with unique original teams.
   * Invalid input throws; an empty array or an unchanged owner order returns [].
   * Swaps fix slots in ascending order using their current owners. Reciprocal
   * swaps are preferred, and already-correct owners are skipped. With unique
   * owners a cycle of length k needs k - 1 swaps; with repeated owners this is
   * not a guarantee of the globally smallest number of swaps.
   */
  function computeRequiredTrades(results) {
    if (!Array.isArray(results)) throw new Error("Invalid lottery results: expected an array.");
    if (!results.length) return [];

    const holder = new Map();
    const target = new Map();
    const slotTeam = new Map();
    const teams = new Set();

    for (const result of results) {
      const pick = toSlot(result?.pick);
      const originalSlot = getOriginalSlot(result);
      const team = normalizeName(result?.team || result?.name);
      const owner = normalizeName(result?.owner) || team;
      if (pick === null || originalSlot === null) {
        throw new Error("Invalid lottery results: each result needs a positive pick and originalSlot or a nonnegative standingIndex.");
      }
      if (!team) throw new Error("Invalid lottery results: original team names must be nonempty strings.");
      if (result?.owner != null && typeof result.owner !== "string") {
        throw new Error("Invalid lottery results: owner names must be strings or omitted to default to the team.");
      }
      if (teams.has(team.toLowerCase())) {
        throw new Error("Invalid lottery results: original team names must be unique (case-insensitive).");
      }
      if (target.has(pick) || holder.has(originalSlot)) {
        throw new Error("Invalid lottery results: pick and original slots must be unique.");
      }

      teams.add(team.toLowerCase());
      holder.set(originalSlot, owner);
      slotTeam.set(originalSlot, team);
      target.set(pick, owner);
    }

    const slots = [...target.keys()].sort((a, b) => a - b);
    const sameSlots = slots.every((slot, index) => slot === index + 1 && holder.has(slot));
    if (!sameSlots) {
      throw new Error("Invalid lottery results: pick and original slots must each cover contiguous slots 1..N.");
    }

    const trades = [];

    slots.forEach((slot, index) => {
      const wanted = target.get(slot);
      const current = holder.get(slot);
      if (current === wanted) return;

      let swapSlot = null;
      let fallbackSlot = null;
      for (let i = index + 1; i < slots.length; i += 1) {
        const candidate = slots[i];
        const candidateHolder = holder.get(candidate);
        if (candidateHolder !== wanted || candidateHolder === target.get(candidate)) continue;
        if (target.get(candidate) === current) {
          swapSlot = candidate;
          break;
        }
        if (fallbackSlot === null) fallbackSlot = candidate;
      }
      if (swapSlot === null) swapSlot = fallbackSlot;
      if (swapSlot === null) {
        throw new Error(`Invalid lottery results: no current owner can supply Pick #${slot}.`);
      }

      const trade = {
        fromTeam: wanted,
        toTeam: current,
        sendPick: swapSlot,
        sendPickVia: slotTeam.get(swapSlot) || "",
        receivePick: slot,
        receivePickVia: slotTeam.get(slot) || "",
      };
      trade.summary = formatTradeSummary(trade);
      trades.push(trade);

      holder.set(slot, wanted);
      holder.set(swapSlot, current);
    });

    return trades;
  }

  return {
    computeRequiredTrades,
    formatTradeSummary,
  };
});

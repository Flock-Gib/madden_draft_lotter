(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./lottery-history.js"), require("node:crypto").webcrypto);
  } else {
    root.lotteryTools = factory(root.lotteryHistory, root.crypto);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, (history, crypto) => {
  function canonicalJson(payload) {
    const json = JSON.parse(JSON.stringify(payload));
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new TypeError("Checksum payload must be a JSON object.");
    }
    delete json._checksum;
    const encode = (value) => {
      if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    };
    return encode(json);
  }

  async function checksum(payload) {
    if (!crypto?.subtle) throw new Error("SHA-256 requires Web Crypto (HTTPS or localhost).");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(payload)));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /** Return a JSON snapshot with a SHA-256 checksum of canonical JSON, excluding only top-level _checksum. */
  async function withChecksum(payload) {
    const snapshot = JSON.parse(JSON.stringify(payload));
    const digest = await checksum(snapshot);
    return { ...snapshot, _checksum: digest };
  }

  /** Verify an optional checksum; callers may warn on mismatch rather than blocking an import. */
  async function verifyChecksum(payload) {
    const present = Boolean(payload && Object.prototype.hasOwnProperty.call(payload, "_checksum"));
    if (!present) return { present: false, valid: true };
    if (typeof payload._checksum !== "string" || !/^[a-f\d]{64}$/i.test(payload._checksum)) {
      return { present: true, valid: false };
    }
    return { present: true, valid: payload._checksum.toLowerCase() === await checksum(payload) };
  }

  /**
   * Recover sanitized intact year records, including nested objects in damaged JSON.
   * String-aware brace scanning never executes text or repairs/invents a partial order.
   */
  function recoverHistory(text) {
    if (typeof text !== "string") return {};
    const extract = (payload) => {
      const extracted = history.extractHistoryFromPayload(payload);
      return Object.keys(extracted).length ? extracted : history.sanitizeHistory(payload);
    };
    try { return extract(JSON.parse(text.replace(/^\uFEFF/, ""))); } catch {}
    const recovered = {};
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{") stack.push(index);
      else if (char === "}" && stack.length) {
        const start = stack.pop();
        try {
          const payload = JSON.parse(text.slice(start, index + 1));
          const yearKey = /"(\d{4})"\s*:\s*$/.exec(text.slice(Math.max(0, start - 40), start));
          const record = history.sanitizeRecord(payload, yearKey?.[1]);
          if (record) recovered[String(record.year)] = record;
          else Object.assign(recovered, extract(payload));
        } catch {}
      }
    }
    return recovered;
  }

  const string = (value) => value === undefined || value === null ? "" : String(value);
  const plainCell = (value) => string(value).replace(/`/g, "'").replace(/[\r\n\t]+/g, " ");
  const csvCell = (value) => {
    let text = string(value);
    if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = (headers, rows) => [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
  const table = (headers, rows) => {
    const cells = [headers, ...rows].map((row) => row.map(plainCell));
    const widths = headers.map((_, index) => Math.max(...cells.map((row) => row[index].length)));
    const lines = cells.map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join(" | ").trimEnd());
    lines.splice(1, 0, widths.map((width) => "-".repeat(width)).join("-+-"));
    return `\`\`\`text\n${lines.join("\n")}\n\`\`\``;
  };

  function tradeRows(trades) {
    return (Array.isArray(trades) ? trades : []).filter((trade) => trade && typeof trade === "object").map((trade) => {
      const assets = Array.isArray(trade.assets) ? trade.assets.map(string) :
        typeof trade.assets === "string" ? trade.assets.split("\n") : [];
      const automatic = trade.source === "auto" || trade.autoGenerated === true ||
        (trade.source !== "manual" && trade.sendPick != null && trade.receivePick != null);
      const pickLabel = (pick, via) => pick == null ? "" : `${pick}${via ? ` (originally ${via})` : ""}`;
      // App-generated swaps have exact pick labels, but manual prose must never be guessed.
      const assetPick = (index) => automatic ? /\bsends Pick #(\d+)(?: \(originally ([^)]+)\))?$/.exec(assets[index] || "") : null;
      const fromAsset = assetPick(0);
      const toAsset = assetPick(1);
      const fromPick = pickLabel(trade.sendPick ?? trade.fromPick ?? fromAsset?.[1], trade.sendPickVia || fromAsset?.[2]);
      const toPick = pickLabel(trade.receivePick ?? trade.toPick ?? toAsset?.[1], trade.receivePickVia || toAsset?.[2]);
      const notes = [assets.length ? `Assets: ${assets.join("; ")}` : "", trade.notes || trade.summary || ""].filter(Boolean).join(" — ");
      return [trade.pick ?? trade.sendPick ?? fromAsset?.[1] ?? "", trade.fromTeam || trade.from || "",
        trade.toTeam || trade.to || "", fromPick, toPick, notes, automatic ? "Y" : "N"];
    });
  }

  const tradeHeaders = ["Pick#", "FromTeam", "ToTeam", "FromPick", "ToPick", "Notes", "AutoGenerated"];
  /** Export both app trades and required swaps, preserving assets and escaping spreadsheet formulas. */
  function tradesCsv(trades) { return csv(tradeHeaders, tradeRows(trades)); }
  /** Render trades as a Discord-safe plain code-fenced table with assets and notes. */
  function tradesTable(trades) { return table(tradeHeaders, tradeRows(trades)); }

  /**
   * Seed a power-of-two bracket from ascending overall picks, with top seeds receiving byes.
   * Counts beyond the available results wrap to pick #1; each seed remains distinct.
   */
  function buildBracket(results, count) {
    if (!Number.isInteger(count) || count < 2 || count > 64) {
      throw new RangeError("Bracket team count must be an integer from 2 to 64.");
    }
    if (!Array.isArray(results) || !results.length || results.some((entry) =>
      !entry || !Number.isSafeInteger(entry.pick) || entry.pick < 1 || typeof entry.team !== "string" || !entry.team.trim())) {
      throw new TypeError("Bracket requires nonempty results with valid picks and teams.");
    }
    const order = [...results].sort((a, b) => a.pick - b.pick);
    const seeds = Array.from({ length: count }, (_, index) => {
      const result = order[index % order.length];
      return { seed: index + 1, team: result.team.trim(), owner: string(result.owner).trim() || result.team.trim(), pick: result.pick };
    });
    let positions = [1, 2];
    while (positions.length < count) {
      const size = positions.length * 2 + 1;
      positions = positions.flatMap((seed) => [seed, size - seed]);
    }
    const matches = [];
    for (let index = 0; index < positions.length; index += 2) {
      const pair = [positions[index], positions[index + 1]].sort((a, b) => a - b);
      matches.push({ home: seeds[pair[0] - 1], away: seeds[pair[1] - 1] || null });
    }
    return { seeds, matches };
  }

  /** Export initial bracket matches, preserving seed, original team, owner and overall pick. */
  function bracketCsv(bracket) {
    return csv(["Match", "HomeSeed", "HomeTeam", "HomeOwner", "HomePick", "AwaySeed", "AwayTeam", "AwayOwner", "AwayPick"],
      bracket.matches.map(({ home, away }, index) => [index + 1, home.seed, home.team, home.owner, home.pick,
        away?.seed ?? "", away?.team ?? "BYE", away?.owner ?? "", away?.pick ?? ""]));
  }
  /** Render initial bracket matches in a Discord-safe code fence. */
  function bracketText(bracket) {
    const label = (seed) => seed ? `#${seed.seed} ${seed.team} (owner: ${seed.owner}; pick #${seed.pick})` : "BYE";
    return table(["Match", "Home", "Away"], bracket.matches.map(({ home, away }, index) => [index + 1, label(home), label(away)]));
  }

  /** Describe changed lottery settings in user-friendly language, without assuming missing defaults. */
  function ruleChanges(previous = {}, next = {}) {
    const labels = {
      lotteryPickCount: "Lottery picks",
      bottomFourProtection: "Bottom-four protection",
      topThreeCooldown: "Top-three cooldown",
      noConsecutiveNumberOne: "No consecutive #1 picks",
    };
    const display = (value) => value === undefined || value === null ? "Not set" :
      typeof value === "boolean" ? value ? "On" : "Off" : string(value);
    return Object.entries(labels).filter(([key]) => previous?.[key] !== next?.[key])
      .map(([key, label]) => `${label}: ${display(previous?.[key])} → ${display(next?.[key])}`);
  }

  return { withChecksum, verifyChecksum, recoverHistory, tradesCsv, tradesTable, buildBracket, bracketCsv, bracketText, ruleChanges };
});

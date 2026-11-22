(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.lotteryTeamBranding = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Presentation-only team identity data. Abbreviations and colors are factual
  // identifiers used to paint monogram balls; no third-party logo artwork ships
  // with the app. Logos are only shown when supplied through the logo manifest.
  const TEAM_IDENTITIES = [
    { id: "ARI", city: "Arizona", nickname: "Cardinals", primary: "#97233F", secondary: "#FFB612", aliases: ["Cards", "Phoenix Cardinals", "St Louis Cardinals", "ARZ"] },
    { id: "ATL", city: "Atlanta", nickname: "Falcons", primary: "#A71930", secondary: "#101820", aliases: [] },
    { id: "BAL", city: "Baltimore", nickname: "Ravens", primary: "#241773", secondary: "#9E7C0C", aliases: [] },
    { id: "BUF", city: "Buffalo", nickname: "Bills", primary: "#00338D", secondary: "#C60C30", aliases: [] },
    { id: "CAR", city: "Carolina", nickname: "Panthers", primary: "#0085CA", secondary: "#101820", aliases: [] },
    { id: "CHI", city: "Chicago", nickname: "Bears", primary: "#0B162A", secondary: "#C83803", aliases: [] },
    { id: "CIN", city: "Cincinnati", nickname: "Bengals", primary: "#FB4F14", secondary: "#101820", aliases: [] },
    { id: "CLE", city: "Cleveland", nickname: "Browns", primary: "#311D00", secondary: "#FF3C00", aliases: [] },
    { id: "DAL", city: "Dallas", nickname: "Cowboys", primary: "#003594", secondary: "#869397", aliases: [] },
    { id: "DEN", city: "Denver", nickname: "Broncos", primary: "#FB4F14", secondary: "#002244", aliases: [] },
    { id: "DET", city: "Detroit", nickname: "Lions", primary: "#0076B6", secondary: "#B0B7BC", aliases: [] },
    { id: "GB", city: "Green Bay", nickname: "Packers", primary: "#203731", secondary: "#FFB612", aliases: ["GNB", "Pack"] },
    { id: "HOU", city: "Houston", nickname: "Texans", primary: "#03202F", secondary: "#A71930", aliases: [] },
    { id: "IND", city: "Indianapolis", nickname: "Colts", primary: "#002C5F", secondary: "#A2AAAD", aliases: ["Baltimore Colts"] },
    { id: "JAX", city: "Jacksonville", nickname: "Jaguars", primary: "#006778", secondary: "#D7A22A", aliases: ["Jags", "JAC"] },
    { id: "KC", city: "Kansas City", nickname: "Chiefs", primary: "#E31837", secondary: "#FFB81C", aliases: ["KAN"] },
    { id: "LV", city: "Las Vegas", nickname: "Raiders", primary: "#A5ACAF", secondary: "#101820", aliases: ["Oakland Raiders", "Los Angeles Raiders", "LVR", "OAK"] },
    { id: "LAC", city: "Los Angeles", nickname: "Chargers", primary: "#0080C6", secondary: "#FFC20E", aliases: ["San Diego Chargers", "LA Chargers", "SD"] },
    { id: "LAR", city: "Los Angeles", nickname: "Rams", primary: "#003594", secondary: "#FFA300", aliases: ["St Louis Rams", "LA Rams", "STL"] },
    { id: "MIA", city: "Miami", nickname: "Dolphins", primary: "#008E97", secondary: "#FC4C02", aliases: ["Fins", "Phins"] },
    { id: "MIN", city: "Minnesota", nickname: "Vikings", primary: "#4F2683", secondary: "#FFC62F", aliases: ["Vikes"] },
    { id: "NE", city: "New England", nickname: "Patriots", primary: "#002244", secondary: "#C60C30", aliases: ["Pats", "NWE"] },
    { id: "NO", city: "New Orleans", nickname: "Saints", primary: "#D3BC8D", secondary: "#101820", aliases: ["NOR"] },
    { id: "NYG", city: "New York", nickname: "Giants", primary: "#0B2265", secondary: "#A71930", aliases: ["NY Giants"] },
    { id: "NYJ", city: "New York", nickname: "Jets", primary: "#125740", secondary: "#FFFFFF", aliases: ["NY Jets"] },
    { id: "PHI", city: "Philadelphia", nickname: "Eagles", primary: "#004C54", secondary: "#A5ACAF", aliases: ["Philly"] },
    { id: "PIT", city: "Pittsburgh", nickname: "Steelers", primary: "#FFB612", secondary: "#101820", aliases: [] },
    { id: "SF", city: "San Francisco", nickname: "49ers", primary: "#AA0000", secondary: "#B3995D", aliases: ["Niners", "Forty Niners", "SFO"] },
    { id: "SEA", city: "Seattle", nickname: "Seahawks", primary: "#002244", secondary: "#69BE28", aliases: ["Hawks"] },
    { id: "TB", city: "Tampa Bay", nickname: "Buccaneers", primary: "#D50A0A", secondary: "#34302B", aliases: ["Bucs", "TAM"] },
    { id: "TEN", city: "Tennessee", nickname: "Titans", primary: "#0C2340", secondary: "#4B92DB", aliases: ["Houston Oilers", "Tennessee Oilers"] },
    { id: "WAS", city: "Washington", nickname: "Commanders", primary: "#5A1414", secondary: "#FFB612", aliases: ["Washington Football Team", "WSH", "WFT"] },
  ].map((team) => Object.freeze({ ...team, name: `${team.city} ${team.nickname}`, aliases: Object.freeze(team.aliases) }));

  // Pleasant, high-chroma fallback colors for custom (non-NFL) team names.
  const CUSTOM_PALETTE = [
    ["#6931CF", "#F4B740"], ["#0E8F83", "#FFFFFF"], ["#D9534F", "#1F2A44"],
    ["#1F6FEB", "#F2C94C"], ["#E07A1F", "#23324A"], ["#2E9E4F", "#F5F0E1"],
    ["#B5338A", "#F6D365"], ["#3949AB", "#FF8A65"], ["#00838F", "#FFD54F"],
    ["#8E24AA", "#80DEEA"], ["#C62828", "#ECEFF1"], ["#5D4037", "#FFB300"],
  ];

  function normalizeTeamKey(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  const aliasIndex = new Map();
  const nicknameIndex = new Map();
  for (const team of TEAM_IDENTITIES) {
    for (const alias of [team.id, team.name, team.nickname, ...team.aliases]) {
      aliasIndex.set(normalizeTeamKey(alias), team);
    }
    nicknameIndex.set(normalizeTeamKey(team.nickname), team);
  }

  function resolveTeamIdentity(name) {
    const key = normalizeTeamKey(name);
    if (!key) return null;
    const exact = aliasIndex.get(key);
    if (exact) return exact;
    // Madden relocations keep the nickname (e.g. "Portland Raiders"), so fall
    // back to the trailing whole-word nickname.
    return nicknameIndex.get(key.split(" ").at(-1)) || null;
  }

  function deriveAbbreviation(name) {
    const words = String(name ?? "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const meaningful = words.filter((word) => !/^(the|of|and)$/i.test(word));
    const parts = meaningful.length ? meaningful : words;
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function relativeLuminance(hex) {
    const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!value) return 0;
    const channels = [0, 2, 4].map((offset) => parseInt(value[1].slice(offset, offset + 2), 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  }

  // Ink used for abbreviations printed on the white ball patch.
  function pickPatchInk(primary, secondary) {
    return [primary, secondary].find((color) => contrastRatio(color, "#FFFFFF") >= 4.5) || "#1D1730";
  }

  function isSafeLogoUrl(url) {
    const value = String(url ?? "").trim();
    if (!value || value.length > 500) return false;
    if (/^https:\/\//i.test(value)) return true;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.includes("\\")) return false;
    return /^[A-Za-z0-9_./-]+$/.test(value) && /\.(png|webp|svg|jpe?g)$/i.test(value);
  }

  function logoKeyFor(name) {
    const team = resolveTeamIdentity(name);
    return team ? team.id : `custom:${normalizeTeamKey(name)}`;
  }

  // Accepts { "logos": { "<team name, alias or abbreviation>": "path.png" } }.
  function normalizeLogoManifest(manifest) {
    const logos = manifest && typeof manifest === "object" && manifest.logos && typeof manifest.logos === "object"
      ? manifest.logos : {};
    const normalized = {};
    for (const [name, url] of Object.entries(logos)) {
      if (!normalizeTeamKey(name) || !isSafeLogoUrl(url)) continue;
      normalized[logoKeyFor(name)] = String(url).trim();
    }
    return normalized;
  }

  const DEFAULT_MANIFEST_URL = "assets/team-logos/manifest.json";
  let manifestPromise = null;
  let loadedLogos = {};

  // Optional, same-origin logo manifest. Missing, slow or invalid manifests
  // resolve to {} (monograms only) and never block the reveal.
  function loadLogoManifest(options = {}) {
    if (manifestPromise) return manifestPromise;
    const fetchImpl = options.fetch ?? (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) return Promise.resolve({});
    const timeoutMs = options.timeoutMs ?? 2000;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    manifestPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        controller?.abort();
        resolve({});
      }, timeoutMs);
      Promise.resolve()
        .then(() => fetchImpl(options.url ?? DEFAULT_MANIFEST_URL, {
          signal: controller?.signal, credentials: "same-origin", cache: "no-cache",
        }))
        .then((response) => (response && response.ok ? response.json() : {}))
        .then((json) => normalizeLogoManifest(json), () => ({}))
        .then((logos) => {
          clearTimeout(timer);
          loadedLogos = logos;
          resolve(logos);
        });
    });
    return manifestPromise;
  }

  function getLoadedLogos() {
    return loadedLogos;
  }

  function resetLogoManifestCache() {
    manifestPromise = null;
    loadedLogos = {};
  }

  function getTeamBranding(name, logos = {}) {
    const label = String(name ?? "").trim();
    const team = resolveTeamIdentity(label);
    const key = logoKeyFor(label);
    let primary;
    let secondary;
    if (team) {
      ({ primary, secondary } = team);
    } else {
      [primary, secondary] = CUSTOM_PALETTE[hashString(normalizeTeamKey(label)) % CUSTOM_PALETTE.length];
    }
    return {
      key,
      known: Boolean(team),
      name: label || "Unknown team",
      canonicalName: team ? team.name : label,
      abbr: team ? team.id : deriveAbbreviation(label),
      primary,
      secondary,
      patch: "#FFFFFF",
      ink: pickPatchInk(primary, secondary),
      logoUrl: Object.prototype.hasOwnProperty.call(logos || {}, key) ? logos[key] : null,
    };
  }

  return {
    TEAM_IDENTITIES,
    contrastRatio,
    deriveAbbreviation,
    getLoadedLogos,
    getTeamBranding,
    isSafeLogoUrl,
    loadLogoManifest,
    normalizeLogoManifest,
    normalizeTeamKey,
    resetLogoManifestCache,
    resolveTeamIdentity,
  };
});

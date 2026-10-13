const test = require("node:test");
const assert = require("node:assert/strict");
const branding = require("./lottery-team-branding.js");

test("all 32 NFL teams resolve to unique canonical abbreviations", () => {
  assert.equal(branding.TEAM_IDENTITIES.length, 32);
  const ids = new Set();
  for (const team of branding.TEAM_IDENTITIES) {
    const result = branding.getTeamBranding(team.name);
    assert.equal(result.known, true, team.name);
    assert.equal(result.abbr, team.id);
    assert.equal(result.key, team.id);
    ids.add(result.abbr);
  }
  assert.equal(ids.size, 32);
});

test("aliases, historical names and abbreviations map to the canonical team", () => {
  const cases = {
    "Oakland Raiders": "LV",
    "las vegas raiders": "LV",
    OAK: "LV",
    Niners: "SF",
    "San Francisco 49ers": "SF",
    "Washington Football Team": "WAS",
    "St. Louis Rams": "LAR",
    "San Diego Chargers": "LAC",
    "NY Giants": "NYG",
    "New York Jets": "NYJ",
    "Green Bay Packers": "GB",
    kc: "KC",
    "Portland Raiders": "LV",
  };
  for (const [name, abbr] of Object.entries(cases)) {
    assert.equal(branding.getTeamBranding(name).abbr, abbr, name);
  }
});

test("teams sharing a city prefix get distinct abbreviations instead of 3-letter slices", () => {
  const abbrs = ["New York Giants", "New York Jets", "New England Patriots", "New Orleans Saints", "Los Angeles Rams", "Los Angeles Chargers"]
    .map((name) => branding.getTeamBranding(name).abbr);
  assert.deepEqual(abbrs, ["NYG", "NYJ", "NE", "NO", "LAR", "LAC"]);
});

test("custom and unknown teams get a stable monogram and palette", () => {
  const first = branding.getTeamBranding("Flockville Thunder Geese");
  const second = branding.getTeamBranding("  flockville   thunder geese ");
  assert.equal(first.known, false);
  assert.equal(first.abbr, "FTG");
  assert.equal(first.key, "custom:flockville thunder geese");
  assert.equal(second.primary, first.primary);
  assert.equal(branding.getTeamBranding("Moose").abbr, "MOO");
  assert.equal(branding.deriveAbbreviation(""), "?");
  assert.equal(branding.getTeamBranding("").name, "Unknown team");
  assert.match(first.primary, /^#[0-9A-F]{6}$/i);
});

test("label ink always reaches readable contrast on the white patch", () => {
  for (const name of [...branding.TEAM_IDENTITIES.map((team) => team.name), "Custom A", "Custom B", "Zed"]) {
    const result = branding.getTeamBranding(name);
    assert.ok(branding.contrastRatio(result.ink, result.patch) >= 4.5, `${name} ${result.ink}`);
  }
});

test("logo manifest keeps only safe URLs and keys them by canonical identity", () => {
  const logos = branding.normalizeLogoManifest({
    logos: {
      "Oakland Raiders": "assets/team-logos/lv.png",
      Bills: "https://example.com/buf.svg",
      Chiefs: "javascript:alert(1)",
      Bears: "//evil.example/chi.png",
      Lions: "data:image/png;base64,AAAA",
      Jets: "assets\\nyj.png",
      Rams: "assets/team-logos/lar.gif",
      "My Custom Team": "assets/team-logos/custom.webp",
    },
  });
  assert.deepEqual(logos, {
    LV: "assets/team-logos/lv.png",
    BUF: "https://example.com/buf.svg",
    "custom:my custom team": "assets/team-logos/custom.webp",
  });
  assert.equal(branding.getTeamBranding("Las Vegas Raiders", logos).logoUrl, "assets/team-logos/lv.png");
  assert.equal(branding.getTeamBranding("Kansas City Chiefs", logos).logoUrl, null);
  assert.deepEqual(branding.normalizeLogoManifest(null), {});
  assert.deepEqual(branding.normalizeLogoManifest({ logos: "nope" }), {});
});

test("shipped manifest bundles no logos", () => {
  const manifest = require("./assets/team-logos/manifest.json");
  assert.deepEqual(branding.normalizeLogoManifest(manifest), {});
});

test("loadLogoManifest resolves to monograms on fetch failure, bad status and timeout", async () => {
  branding.resetLogoManifestCache();
  assert.deepEqual(await branding.loadLogoManifest({ fetch: () => Promise.reject(new Error("offline")) }), {});
  branding.resetLogoManifestCache();
  assert.deepEqual(await branding.loadLogoManifest({ fetch: async () => ({ ok: false }) }), {});
  branding.resetLogoManifestCache();
  assert.deepEqual(await branding.loadLogoManifest({ fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } }) }), {});
  branding.resetLogoManifestCache();
  const started = Date.now();
  assert.deepEqual(await branding.loadLogoManifest({ timeoutMs: 30, fetch: () => new Promise(() => {}) }), {});
  assert.ok(Date.now() - started < 1000);
  branding.resetLogoManifestCache();
});

test("loadLogoManifest caches a successful manifest", async () => {
  branding.resetLogoManifestCache();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ logos: { Bills: "assets/team-logos/buf.png" } }) };
  };
  assert.deepEqual(await branding.loadLogoManifest({ fetch }), { BUF: "assets/team-logos/buf.png" });
  await branding.loadLogoManifest({ fetch });
  assert.equal(calls, 1);
  assert.deepEqual(branding.getLoadedLogos(), { BUF: "assets/team-logos/buf.png" });
  branding.resetLogoManifestCache();
});

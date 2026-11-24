const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("./supabase-history.js");

function response(status, payload = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => payload === null ? "" : JSON.stringify(payload),
  };
}

function makeClient(fetchImpl, storage = new Map(), config = {
  url: "https://flockville.supabase.co",
  anonKey: "sb_publishable_test",
}) {
  const sessionStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  return createClient(config, { fetchImpl, storage: sessionStorage });
}

test("finalized corrections use the correction RPC and verify its returned record", async () => {
  const calls = [];
  let mismatch = false;
  const client = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { id: "admin" });
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url.endsWith("/correct_flockville_history")) {
      return response(200, mismatch ? {} : body.p_record || { year: body.p_year });
    }
    return response(200, body);
  });
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  const records = { 2025: { year: 2025, finalized: false }, 2026: { year: 2026, finalized: true } };
  await client.saveHistory(records, { corrections: { 2026: "Fix original pick owner" } });
  assert.deepEqual(calls[0].body, [{ season_year: 2025, record: records[2025] }]);
  assert.deepEqual(calls[1].body, { p_year: 2026, p_record: records[2026], p_reason: "Fix original pick owner" });
  assert.deepEqual(await client.deleteYear(2026, { reason: "Remove duplicate lottery" }), { deleted: 1 });
  assert.deepEqual(calls.at(-1).body, { p_year: 2026, p_record: null, p_reason: "Remove duplicate lottery" });
  mismatch = true;
  await assert.rejects(client.saveHistory(records, { years: [2026], corrections: { 2026: "Fix original pick owner" } }), /did not confirm/);
  await assert.rejects(client.deleteYear(2026, { reason: "Remove duplicate lottery" }), /did not confirm/);
});

test("dashboard and broadcast reads are public; publishing is authenticated and confirmed", async () => {
  const calls = [];
  const dashboard = { season_year: 2027, announcements: "Draft night", event_title: "Lottery", event_at: "2027-01-02T18:00:00.000Z" };
  let badEcho = false;
  let badBroadcast = false;
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return response(200, { id: "admin" });
    if (url.includes("/flockville_dashboard")) return response(200,
      badEcho ? [] : [{ ...dashboard, event_at: "2027-01-02T18:00:00+00:00" }]);
    if (url.includes("/flockville_live?")) return response(200, [{ picks: [] }]);
    if (url.includes("/draft_lottery_audit")) return response(200, []);
    const payload = JSON.parse(options.body);
    if (badBroadcast) return response(200, {});
    return response(200, { run_id: payload.p_run_id, season_year: payload.p_year,
      total: payload.p_total, status: payload.p_status, picks: payload.p_picks });
  });
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await client.loadDashboard();
  await client.loadBroadcast();
  assert.ok(calls.every(({ options }) => options.headers.Authorization === undefined));
  await assert.rejects(client.saveDashboard(dashboard), /Sign in/);
  await assert.rejects(client.publishBroadcast({}), /Sign in/);
  await assert.rejects(client.loadAudit(), /Sign in/);
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  assert.equal((await client.saveDashboard(dashboard)).season_year, 2027);
  assert.equal(calls.at(-1).options.headers.Authorization, "Bearer access");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: 1, ...dashboard });
  badEcho = true;
  await assert.rejects(client.saveDashboard(dashboard), /did not confirm/);
  const payload = { p_run_id: "run", p_year: 2027, p_total: 8, p_status: "live", p_picks: [], p_start: true };
  await client.publishBroadcast(payload);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), payload);
  badBroadcast = true;
  await assert.rejects(client.publishBroadcast(payload), /did not confirm/);
  await client.loadAudit(80);
  assert.match(calls.at(-1).url, /limit=50&id=lt.80$/);
  await client.loadBroadcast();
  assert.equal(calls.at(-1).options.headers.Authorization, undefined);
  assert.ok(!calls.at(-1).url.includes("publisher_id"));
});

test("magic-link callback stores the session, cleans the URL, and loads year-keyed history", async () => {
  const requests = [];
  const storage = new Map();
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return response(200, {
      id: "admin-id", email: "admin@example.com",
    });
  }, storage);
  let cleanedUrl;
  const result = await client.initialize(
    { hash: "#access_token=access&refresh_token=refresh&expires_in=3600", pathname: "/app/", search: "?source=mail" },
    (_state, _title, url) => { cleanedUrl = url; },
  );
  assert.equal(result.configured, true);
  assert.equal(result.user.email, "admin@example.com");
  assert.equal(client.isAuthenticated(), true);
  assert.equal(client.userEmail(), "admin@example.com");
  assert.equal(cleanedUrl, "/app/?source=mail");
  assert.equal(JSON.parse(storage.get("flockvilleSupabaseSession")).refresh_token, "refresh");
  assert.equal(requests[0].url, "https://flockville.supabase.co/auth/v1/user");
  assert.equal(requests[0].options.headers.Authorization, "Bearer access");

  requests.length = 0;
  const historyClient = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/rpc/is_flockville_admin")) return response(200, true);
    return response(200, [{ season_year: 2026, record: { year: 2026 } }]);
  });
  await historyClient.initialize(
    { hash: "#access_token=access&refresh_token=refresh", pathname: "/", search: "" },
    () => {},
  );
  const records = await historyClient.loadHistory();
  assert.deepEqual(records, { 2026: { year: 2026 } });
  assert.match(requests.at(-1).url, /season_year,record/);
});

test("sign-in requests existing users only and never put service credentials in the browser", async () => {
  let request;
  const client = makeClient(async (url, options) => {
    request = { url, options };
    return response(200);
  });
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await client.signInWithEmail(" admin@example.com ", "https://flockville.example/");
  assert.match(request.url, /redirect_to=https%3A%2F%2Fflockville\.example%2F/);
  assert.deepEqual(JSON.parse(request.options.body), { email: "admin@example.com", create_user: false });
  assert.equal(request.options.headers.apikey, "sb_publishable_test");
  assert.equal(request.options.headers.Authorization, undefined);
  await assert.rejects(client.saveHistory({ 2026: { year: 2026 } }), /Sign in to Supabase/);
});

test("password sign-in stores a session without the password and uses it for admin checks and updates", async () => {
  const calls = [];
  const storage = new Map();
  const user = { id: "admin-id", email: "admin@example.com" };
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    if (url.includes("grant_type=password")) return response(200, {
      access_token: "access", refresh_token: "refresh", expires_in: 3600, user,
    });
    if (url.endsWith("/rpc/is_flockville_admin")) return response(200, true);
    if (url.endsWith("/auth/v1/user") && options.method === "PUT") return response(200, user);
    return response(200, []);
  }, storage);
  await client.initialize({ hash: "", pathname: "/", search: "" });
  assert.deepEqual(await client.signInWithPassword(" admin@example.com ", "private-password"), user);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "admin@example.com", password: "private-password" });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(client.userEmail(), user.email);
  assert.equal(await client.checkAdmin(), true);
  assert.equal(calls[1].options.headers.Authorization, "Bearer access");
  await client.updatePassword("different-password");
  assert.equal(calls[2].options.headers.Authorization, "Bearer access");
  assert.deepEqual(JSON.parse(calls[2].options.body), { password: "different-password" });
  assert.doesNotMatch(storage.get("flockvilleSupabaseSession"), /private-password|different-password/);
});

test("password auth failures and invalid responses never create a session", async () => {
  const client = makeClient(async (_url, options) => {
    if (JSON.parse(options.body).password === "invalid-response") return response(200, {});
    return response(400, { message: "Invalid login credentials" });
  });
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await assert.rejects(client.signInWithPassword("admin@example.com", "wrong"), /Invalid login credentials/);
  await assert.rejects(client.signInWithPassword("admin@example.com", "invalid-response"), /invalid sign-in response/);
  await assert.rejects(client.updatePassword("new"), /Sign in/);
  assert.equal(client.isAuthenticated(), false);
});

test("expired sessions refresh once and serialized saves/deletes preserve their order", async () => {
  const storage = new Map([["flockvilleSupabaseSession", JSON.stringify({
    access_token: "expired", refresh_token: "refresh", expires_at: 1,
  })]]);
  const calls = [];
  let firstUserRequest = true;
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user") && firstUserRequest) {
      firstUserRequest = false;
      return response(401, { message: "expired" });
    }
    if (url.includes("/auth/v1/token?")) {
      return response(200, {
        access_token: "fresh", refresh_token: "new-refresh", expires_in: 3600,
      });
    }
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    if (options.method === "POST" && url.includes("/rest/v1/draft_lottery_history")) {
      return response(201, JSON.parse(options.body));
    }
    return response(200, []);
  }, storage);
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await Promise.all([
    client.saveHistory({ 2026: { year: 2026 } }),
    client.deleteYear(2025),
  ]);
  const writes = calls.filter(({ url }) => url.includes("/rest/v1/"));
  assert.equal(writes.length, 3);
  assert.equal(writes[0].options.method, "POST");
  assert.equal(writes[0].options.headers.Authorization, "Bearer fresh");
  assert.match(writes[0].options.headers.Prefer, /return=representation/);
  assert.deepEqual(JSON.parse(writes[0].options.body), [{ season_year: 2026, record: { year: 2026 } }]);
  assert.match(writes[1].url, /season_year=eq\.2025/);
  assert.equal(writes[1].options.method, "DELETE");
});

test("saves send only the requested years and require Supabase to echo each stored record", async () => {
  const client = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    if (options.method === "POST") return response(201, JSON.parse(options.body));
    return response(200, []);
  });
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  const saved = await client.saveHistory({ 2025: { year: 2025 }, 2026: { year: 2026, finalOrder: [{ pick: 1 }] } }, { years: ["2026"] });
  assert.deepEqual(saved.saved, [2026]);
  assert.ok(saved.savedAt);

  const silent = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    return options.method === "POST" ? response(201, []) : response(200, []);
  });
  await silent.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  await assert.rejects(silent.saveHistory({ 2026: { year: 2026 } }), /did not confirm the saved 2026 lottery/);

  const altered = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    return options.method === "POST"
      ? response(201, [{ season_year: 2026, record: { year: 2026, finalOrder: [] } }]) : response(200, []);
  });
  await altered.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  await assert.rejects(altered.saveHistory({ 2026: { year: 2026, finalOrder: [{ pick: 1 }] } }), /did not confirm/);
});

test("deleting reports how many cloud rows were removed", async () => {
  const client = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    return response(200, options.method === "DELETE" ? [{ season_year: 2025 }] : []);
  });
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  assert.deepEqual(await client.deleteYear(2025), { deleted: 1 });
  const none = makeClient(async (url) => response(200, url.endsWith("/auth/v1/user") ? { email: "a@b.co" } : []));
  await none.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  assert.deepEqual(await none.deleteYear(2025), { deleted: 0 });
  const denied = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "a@b.co" });
    return response(200, options.method === "DELETE" ? [] : [{ season_year: 2025 }]);
  });
  await denied.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  await assert.rejects(denied.deleteYear(2025), /did not delete 2025/);
});

test("configuration and Supabase errors are surfaced instead of silently falling back", async () => {
  const invalid = createClient({ url: "http://example.com", anonKey: "key" }, { fetchImpl: async () => response(200) });
  await assert.rejects(invalid.initialize({ hash: "", pathname: "/", search: "" }), /must use HTTPS/);

  const client = makeClient(async (url) => url.endsWith("/auth/v1/user")
    ? response(200, { email: "admin@example.com" })
    : response(403, { message: "admin policy denied" }));
  await client.initialize({
    hash: "#access_token=access&refresh_token=refresh", pathname: "/", search: "",
  }, () => {});
  await assert.rejects(client.loadHistory(), /403.*admin policy denied/);

  const authFailure = makeClient(async () => response(200));
  let cleanedUrl;
  await assert.rejects(authFailure.initialize({
    hash: "#error=access_denied&error_description=Link+expired", pathname: "/", search: "",
  }, (_state, _title, url) => { cleanedUrl = url; }), /Supabase sign-in failed: Link expired/);
  assert.equal(cleanedUrl, "/");
});

test("anyone can read the archive without signing in, and non-admin accounts are identified separately", async () => {
  const requests = [];
  const visitor = makeClient(async (url, options) => {
    requests.push({ url, options });
    return response(200, [{ season_year: 2025, record: { year: 2025 } }]);
  });
  await visitor.initialize({ hash: "", pathname: "/", search: "" });
  assert.deepEqual(await visitor.loadHistory(), { 2025: { year: 2025 } });
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.headers.apikey, "sb_publishable_test");
  assert.equal(await visitor.checkAdmin(), false);
  assert.equal(requests.length, 1, "signed-out visitors never call the admin check");

  const calls = [];
  const client = makeClient(async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "user@example.com" });
    return url.endsWith("/rpc/is_flockville_admin") ? response(200, false) : response(200, []);
  });
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  assert.deepEqual(await client.loadHistory(), {});
  assert.equal(await client.checkAdmin(), false);
  assert.equal(calls.some((url) => url.includes("draft_lottery_history")), true);
});

test("an expired admin session falls back to the public archive instead of hiding it", async () => {
  const storage = new Map([["flockvilleSupabaseSession", JSON.stringify({
    access_token: "expired", refresh_token: "bad-refresh", expires_at: 1,
  })]]);
  const reads = [];
  const client = makeClient(async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "admin@example.com" });
    if (url.includes("/auth/v1/token?")) return response(400, { message: "refresh revoked" });
    reads.push(options.headers.Authorization);
    return options.headers.Authorization ? response(401, { message: "JWT expired" })
      : response(200, [{ season_year: 2024, record: { year: 2024 } }]);
  }, storage);
  await client.initialize({ hash: "", pathname: "/", search: "" }).catch(() => {});
  assert.deepEqual(await client.loadHistory(), { 2024: { year: 2024 } });
  assert.equal(reads.at(-1), undefined);
});

test("a timed-out connection surfaces a retryable error", async () => {
  const client = makeClient(async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await assert.rejects(client.signInWithEmail("admin@example.com", "https://example.com/"), /did not respond within 15 seconds/);
});

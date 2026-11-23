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
    return response(204);
  }, storage);
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await Promise.all([
    client.saveHistory({ 2026: { year: 2026 } }),
    client.deleteYear(2025),
  ]);
  const writes = calls.filter(({ url }) => url.includes("/rest/v1/"));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].options.method, "POST");
  assert.equal(writes[0].options.headers.Authorization, "Bearer fresh");
  assert.deepEqual(JSON.parse(writes[0].options.body), [{
    season_year: 2026,
    record: { year: 2026 },
    updated_at: JSON.parse(writes[0].options.body)[0].updated_at,
  }]);
  assert.match(writes[1].url, /season_year=eq\.2025/);
  assert.equal(writes[1].options.method, "DELETE");
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

test("loading distinguishes a non-admin account from an empty archive", async () => {
  const calls = [];
  const client = makeClient(async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return response(200, { email: "user@example.com" });
    return response(200, false);
  });
  await client.initialize({ hash: "#access_token=access", pathname: "/", search: "" }, () => {});
  await assert.rejects(client.loadHistory(), /not authorized as a Flockville admin/);
  assert.equal(calls.some((url) => url.includes("draft_lottery_history")), false);
});

test("a timed-out connection surfaces a retryable error", async () => {
  const client = makeClient(async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });
  await client.initialize({ hash: "", pathname: "/", search: "" });
  await assert.rejects(client.signInWithEmail("admin@example.com", "https://example.com/"), /did not respond within 15 seconds/);
});

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.flockvilleSupabaseHistory = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const TABLE = "draft_lottery_history";

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
  }

  // JSON round-trip drops undefined fields exactly as the request body did.
  function sameJson(stored, sent) {
    if (stored === undefined) return false;
    return JSON.stringify(canonical(stored)) === JSON.stringify(canonical(JSON.parse(JSON.stringify(sent))));
  }

  function createClient(config = {}, { fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
    let url = "";
    let anonKey = "";
    let session = null;
    let operationQueue = Promise.resolve();

    function configure(nextConfig = {}) {
      const cleanUrl = String(nextConfig.url || "").trim().replace(/\/+$/, "");
      const cleanKey = String(nextConfig.anonKey || "").trim();
      if (!cleanUrl && !cleanKey) {
        url = "";
        anonKey = "";
        return false;
      }
      let parsed;
      try {
        parsed = new URL(cleanUrl);
      } catch {
        throw new Error("Supabase URL must be a valid HTTPS URL.");
      }
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        throw new Error("Supabase URL must use HTTPS.");
      }
      if (!cleanKey) throw new Error("Supabase publishable anon key is missing.");
      if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable; cloud history cannot connect.");
      url = cleanUrl;
      anonKey = cleanKey;
      return true;
    }

    function saveSession(nextSession) {
      session = nextSession;
      try {
        if (session) storage?.setItem("flockvilleSupabaseSession", JSON.stringify(session));
        else storage?.removeItem("flockvilleSupabaseSession");
      } catch {
        throw new Error("Could not save the Supabase session in this browser.");
      }
    }

    function loadSession() {
      try {
        const raw = storage?.getItem("flockvilleSupabaseSession");
        session = raw ? JSON.parse(raw) : null;
      } catch {
        session = null;
      }
    }

    function parseError(payload, status) {
      const message = payload?.msg || payload?.message || payload?.error_description || payload?.error;
      return new Error(`Supabase request failed (${status})${message ? `: ${message}` : "."}`);
    }

    async function readResponse(response) {
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }
      if (!response.ok) throw parseError(payload, response.status);
      return payload;
    }

    async function fetchWithTimeout(resource, options) {
      try {
        return await fetchImpl(resource, { ...options, signal: AbortSignal.timeout(15000) });
      } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw new Error("Supabase did not respond within 15 seconds. Check your connection and try again.");
        }
        throw error;
      }
    }

    async function refreshSession() {
      if (!session?.refresh_token) throw new Error("Supabase session expired. Sign in again.");
      const response = await fetchWithTimeout(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const refreshed = await readResponse(response);
      saveSession({ ...refreshed, expires_at: Date.now() / 1000 + Number(refreshed.expires_in || 3600) });
      return session;
    }

    async function request(path, options = {}, retry = true) {
      if (!url || !anonKey) throw new Error("Configure Supabase URL and publishable anon key first.");
      const token = options.anonymous ? "" : session?.access_token;
      const headers = {
        apikey: anonKey,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (!anonKey.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${anonKey}`;
      const response = await fetchWithTimeout(`${url}${path}`, {
        method: options.method || "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 401 && retry && token && session?.refresh_token) {
        await refreshSession();
        return request(path, options, false);
      }
      return readResponse(response);
    }

    function enqueue(work) {
      const next = operationQueue.then(work);
      operationQueue = next.catch(() => {});
      return next;
    }

    async function initialize(location = globalThis.location, replaceState = globalThis.history?.replaceState?.bind(globalThis.history)) {
      const enabled = configure(config);
      if (!enabled) return { configured: false, user: null };
      loadSession();
      const hash = new URLSearchParams(String(location?.hash || "").replace(/^#/, ""));
      const authError = hash.get("error_description") || hash.get("error");
      if (authError) {
        replaceState?.({}, "", `${location.pathname || "/"}${location.search || ""}`);
        throw new Error(`Supabase sign-in failed: ${authError}`);
      }
      const token = hash.get("access_token");
      if (token) {
        const expiresIn = Number(hash.get("expires_in") || 3600);
        saveSession({
          access_token: token,
          refresh_token: hash.get("refresh_token") || "",
          token_type: hash.get("token_type") || "bearer",
          expires_at: Number(hash.get("expires_at")) || Date.now() / 1000 + expiresIn,
        });
        replaceState?.({}, "", `${location.pathname || "/"}${location.search || ""}`);
      }
      if (!session?.access_token) return { configured: true, user: null };
      const user = await request("/auth/v1/user");
      saveSession({ ...session, user });
      return { configured: true, user };
    }

    async function signInWithEmail(email, redirectTo) {
      const cleanEmail = String(email || "").trim();
      if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Enter a valid admin email address.");
      await request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        body: { email: cleanEmail, create_user: false },
        headers: anonKey.startsWith("sb_publishable_") ? {} : { Authorization: `Bearer ${anonKey}` },
      });
    }

    async function signInWithPassword(email, password) {
      const cleanEmail = String(email || "").trim();
      if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Enter a valid admin email address.");
      if (!password) throw new Error("Enter your password.");
      const result = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        anonymous: true,
        body: { email: cleanEmail, password },
      });
      if (!result?.access_token || !result?.refresh_token || !result?.user) {
        throw new Error("Supabase returned an invalid sign-in response. Please try again.");
      }
      saveSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        token_type: result.token_type || "bearer",
        expires_at: Number(result.expires_at) || Date.now() / 1000 + Number(result.expires_in || 3600),
        user: result.user,
      });
      return result.user;
    }

    async function updatePassword(password) {
      if (!session?.access_token) throw new Error("Sign in before setting a password.");
      if (!password) throw new Error("Enter a new password.");
      const user = await request("/auth/v1/user", { method: "PUT", body: { password } });
      if (!user?.id) throw new Error("Supabase did not confirm the password update.");
      saveSession({ ...session, user });
      return user;
    }

    async function signOut() {
      if (session?.access_token) {
        try {
          await request("/auth/v1/logout", { method: "POST" });
        } finally {
          saveSession(null);
        }
      }
    }

    async function checkAdmin() {
      if (!session?.access_token) return false;
      const isAdmin = await request("/rest/v1/rpc/is_flockville_admin", {
        method: "POST",
        body: {},
      });
      return isAdmin === true;
    }

    // Lottery history is public; no sign-in is needed to read it.
    async function loadHistory() {
      const path = `/rest/v1/${TABLE}?select=season_year,record&order=season_year.desc`;
      let rows;
      try {
        rows = await request(path);
      } catch (error) {
        // An expired or revoked admin session must not hide the public archive.
        if (!session?.access_token || /did not respond/.test(error.message)) throw error;
        rows = await request(path, { anonymous: true });
      }
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid lottery history response.");
      return rows.reduce((records, row) => {
        const year = Number(row.season_year);
        if (Number.isInteger(year) && row.record && typeof row.record === "object") {
          records[String(year)] = row.record;
        }
        return records;
      }, {});
    }

    function saveHistory(records, { years, corrections = {} } = {}) {
      if (!session?.access_token) return Promise.reject(new Error("Sign in to Supabase before saving cloud history."));
      const wanted = years ? new Set(years.map((year) => Number(year))) : null;
      const rows = Object.values(records || {})
        .filter((record) => Number.isInteger(Number(record?.year)) && (!wanted || wanted.has(Number(record.year))))
        .map((record) => ({ season_year: Number(record.year), record }));
      if (!rows.length) return Promise.resolve({ saved: [] });
      return enqueue(async () => {
        const regular = rows.filter((row) => !corrections[row.season_year]);
        const returned = regular.length ? await request(`/rest/v1/${TABLE}?on_conflict=season_year`, {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: regular,
        }) : [];
        // A 2xx with missing or altered rows (for example RLS filtering) is not a saved record.
        const confirmed = new Map((Array.isArray(returned) ? returned : [])
          .map((row) => [Number(row?.season_year), row?.record]));
        for (const row of rows.filter((entry) => corrections[entry.season_year])) {
          confirmed.set(row.season_year, await request("/rest/v1/rpc/correct_flockville_history", {
            method: "POST",
            body: { p_year: row.season_year, p_record: row.record, p_reason: corrections[row.season_year] },
          }));
        }
        rows.forEach((row) => {
          if (!sameJson(confirmed.get(row.season_year), row.record)) {
            throw new Error(`Supabase did not confirm the saved ${row.season_year} lottery. Cloud storage remains unverified; retry the save.`);
          }
        });
        return { saved: rows.map((row) => row.season_year), savedAt: new Date().toISOString() };
      });
    }

    function deleteYear(year, { reason } = {}) {
      if (!session?.access_token) return Promise.reject(new Error("Sign in to Supabase before deleting cloud history."));
      const safeYear = Number(year);
      if (!Number.isInteger(safeYear) || safeYear < 1000 || safeYear > 9999) {
        return Promise.reject(new Error("Choose a valid season year to delete."));
      }
      return enqueue(async () => {
        if (reason) {
          const removed = await request("/rest/v1/rpc/correct_flockville_history", {
            method: "POST", body: { p_year: safeYear, p_record: null, p_reason: reason },
          });
          if (removed !== null && Number(removed?.year) !== safeYear) {
            throw new Error("Supabase did not confirm the deleted lottery year.");
          }
          return { deleted: removed ? 1 : 0 };
        }
        const removed = await request(`/rest/v1/${TABLE}?season_year=eq.${safeYear}`, {
          method: "DELETE",
          headers: { Prefer: "return=representation" },
        });
        if (!Array.isArray(removed)) throw new Error("Supabase did not confirm the deleted lottery year.");
        if (!removed.length) {
          const remaining = await request(`/rest/v1/${TABLE}?select=season_year&season_year=eq.${safeYear}`);
          if (!Array.isArray(remaining) || remaining.length) {
            throw new Error(`Supabase did not delete ${safeYear}. Refresh your admin access and try again.`);
          }
        }
        return { deleted: removed.length };
      });
    }

    async function loadDashboard() {
      const rows = await request("/rest/v1/flockville_dashboard?select=season_year,announcements,event_title,event_at&id=eq.1", { anonymous: true });
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid dashboard.");
      return rows[0] || null;
    }

    async function saveDashboard(dashboard) {
      if (!session?.access_token) throw new Error("Sign in before publishing league news.");
      const rows = await request("/rest/v1/flockville_dashboard?on_conflict=id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: { id: 1, ...dashboard },
      });
      if (!Array.isArray(rows) || !rows[0] || Object.entries(dashboard).some(([key, value]) =>
        key === "event_at" && value ? Date.parse(rows[0][key]) !== Date.parse(value) : rows[0][key] !== value)) {
        throw new Error("Supabase did not confirm the dashboard update.");
      }
      return rows[0];
    }

    async function loadBroadcast() {
      const rows = await request("/rest/v1/flockville_live?select=run_id,season_year,total,status,picks,revision,updated_at&id=eq.1", { anonymous: true });
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid broadcast.");
      return rows[0] || null;
    }

    async function publishBroadcast(payload) {
      if (!session?.access_token) throw new Error("Sign in before broadcasting.");
      const room = await request("/rest/v1/rpc/publish_flockville_live", { method: "POST", body: payload });
      if (!room || room.run_id !== payload.p_run_id || room.season_year !== payload.p_year ||
        room.total !== payload.p_total || room.status !== payload.p_status || !sameJson(room.picks, payload.p_picks)) {
        throw new Error("Supabase did not confirm the broadcast update.");
      }
      return room;
    }

    async function loadAudit(beforeId) {
      if (!session?.access_token) throw new Error("Sign in to read database backups.");
      const cursor = beforeId ? `&id=lt.${encodeURIComponent(beforeId)}` : "";
      const rows = await request(`/rest/v1/draft_lottery_audit?select=id,season_year,action,reason,before_record,after_record,created_at&order=id.desc&limit=50${cursor}`);
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid edit log.");
      return rows;
    }

    return {
      checkAdmin,
      deleteYear,
      initialize,
      isAuthenticated: () => Boolean(session?.access_token),
      isConfigured: () => Boolean(url && anonKey),
      loadHistory,
      loadDashboard,
      saveDashboard,
      loadBroadcast,
      publishBroadcast,
      loadAudit,
      saveHistory,
      setUser: (user) => {
        if (session) saveSession({ ...session, user });
      },
      signInWithEmail,
      signInWithPassword,
      signOut,
      updatePassword,
      userEmail: () => session?.user?.email || "",
    };
  }

  return { createClient };
});

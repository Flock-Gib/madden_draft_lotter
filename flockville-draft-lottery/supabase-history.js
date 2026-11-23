(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.flockvilleSupabaseHistory = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const TABLE = "draft_lottery_history";

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

    async function refreshSession() {
      if (!session?.refresh_token) throw new Error("Supabase session expired. Sign in again.");
      const response = await fetchImpl(`${url}/auth/v1/token?grant_type=refresh_token`, {
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
      const accessToken = session?.access_token || anonKey;
      const headers = {
        apikey: anonKey,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      };
      if (session?.access_token) headers.Authorization = `Bearer ${accessToken}`;
      else if (!anonKey.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${anonKey}`;
      const response = await fetchImpl(`${url}${path}`, {
        method: options.method || "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 401 && retry && session?.refresh_token) {
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

    async function signOut() {
      if (session?.access_token) {
        try {
          await request("/auth/v1/logout", { method: "POST" });
        } finally {
          saveSession(null);
        }
      }
    }

    async function loadHistory() {
      const rows = await request(`/rest/v1/${TABLE}?select=season_year,record&order=season_year.desc`);
      if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid lottery history response.");
      return rows.reduce((records, row) => {
        const year = Number(row.season_year);
        if (Number.isInteger(year) && row.record && typeof row.record === "object") {
          records[String(year)] = row.record;
        }
        return records;
      }, {});
    }

    function saveHistory(records) {
      if (!session?.access_token) return Promise.reject(new Error("Sign in to Supabase before saving cloud history."));
      const rows = Object.values(records || {})
        .filter((record) => Number.isInteger(Number(record?.year)))
        .map((record) => ({
          season_year: Number(record.year),
          record,
          updated_at: new Date().toISOString(),
        }));
      if (!rows.length) return Promise.resolve();
      return enqueue(() => request(`/rest/v1/${TABLE}?on_conflict=season_year`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: rows,
      }));
    }

    function deleteYear(year) {
      if (!session?.access_token) return Promise.reject(new Error("Sign in to Supabase before deleting cloud history."));
      const safeYear = Number(year);
      if (!Number.isInteger(safeYear) || safeYear < 1000 || safeYear > 9999) {
        return Promise.reject(new Error("Choose a valid season year to delete."));
      }
      return enqueue(() => request(`/rest/v1/${TABLE}?season_year=eq.${safeYear}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }));
    }

    return {
      deleteYear,
      initialize,
      isAuthenticated: () => Boolean(session?.access_token),
      isConfigured: () => Boolean(url && anonKey),
      loadHistory,
      saveHistory,
      setUser: (user) => {
        if (session) saveSession({ ...session, user });
      },
      signInWithEmail,
      signOut,
      userEmail: () => session?.user?.email || "",
    };
  }

  return { createClient };
});

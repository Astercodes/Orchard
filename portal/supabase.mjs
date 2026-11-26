import { goalsForFamily } from "./goals.mjs";

export function createSupabase({ url, publicKey, secretKey, fetcher = fetch }) {
  if (!url || !publicKey || !secretKey) {
    throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY.");
  }
  const base = new URL(url);
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new Error("The Supabase URL must use HTTPS.");
  }

  async function request(path, { key = publicKey, token, body, method, prefer } = {}) {
    const headers = { apikey: key };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const response = await fetcher(new URL(path, base), {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error("Supabase request failed");
      error.upstreamStatus = response.status;
      error.code = data?.code ?? data?.error_code;
      throw error;
    }
    return data;
  }

  const admin = (path, options) => request(path, { ...options, key: secretKey });
  const memberPath = "/rest/v1/orchard_members";
  const statePath = "/rest/v1/orchard_goal_state";

  return {
    createAccount(email, password, role, familyId) {
      return admin("/auth/v1/admin/users", {
        body: { email, password, email_confirm: true, app_metadata: { orchard: { role, family_id: familyId } } },
      });
    },
    login(email, password) {
      return request("/auth/v1/token?grant_type=password", { body: { email, password } });
    },
    async identity(token) {
      if (!token) return null;
      let user;
      try { user = await request("/auth/v1/user", { token }); }
      catch (error) {
        if ([401, 403].includes(error.upstreamStatus)) return null;
        throw error;
      }
      const [membership] = await admin(`${memberPath}?user_id=eq.${encodeURIComponent(user.id)}&select=family_id,role`);
      return membership ? { email: user.email, ...membership } : null;
    },
    async hasChild(familyId) {
      const children = await admin(`${memberPath}?family_id=eq.${encodeURIComponent(familyId)}&role=eq.child&select=user_id`);
      return children.length > 0;
    },
    logout(token) {
      return request("/auth/v1/logout?scope=local", { method: "POST", token });
    },
    async goals(account, action, args, mutates) {
      const family = encodeURIComponent(account.family_id);
      const familyPath = `${statePath}?family_id=eq.${family}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const [current] = await admin(`${familyPath}&select=version,state`);
        const state = current?.state ?? { records: [], ticks: {} };
        const result = goalsForFamily(state, account.role)[action](...args);
        if (!mutates) return result;
        if (!current) {
          const inserted = await admin(`${statePath}?on_conflict=family_id`, {
            body: { family_id: account.family_id, state },
            prefer: "resolution=ignore-duplicates,return=representation",
          });
          if (inserted.length) return result;
        } else {
          const updated = await admin(`${familyPath}&version=eq.${current.version}`, {
            method: "PATCH", body: { version: current.version + 1, state }, prefer: "return=representation",
          });
          if (updated.length) return result;
        }
      }
      throw Object.assign(new Error("The family workspace changed. Please retry."), { status: 409 });
    },
  };
}

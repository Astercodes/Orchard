import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lifeAreas } from "./goals.mjs";
import { createSupabase } from "./supabase.mjs";

const staticFiles = new Map([
  ["/", ["text/html", "./portal.html"]],
  ["/portal.css", ["text/css", "./portal.css"]],
  ["/portal-client.js", ["text/javascript", "./portal-client.js"]],
  ["/assets/mark.svg", ["image/svg+xml", "../assets/mark.svg"]],
]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookie = (token, seconds) => `orchard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function emailAddress(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address.");
  return email;
}

function password(value, minimum = 12) {
  if (typeof value !== "string" || value.length < minimum || value.length > 128) {
    fail(400, `Use a password between ${minimum} and 128 characters.`);
  }
  return value;
}

async function jsonBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) fail(415, "Expected JSON.");
  if (Number(req.headers["content-length"]) > 64_000) fail(413, "Request is too large.");
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) fail(413, "Request is too large.");
    chunks.push(chunk);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks)); } catch { fail(400, "Invalid JSON."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "Expected an object.");
  return input;
}

const calls = {
  monthlyGoals: ["parent", "period"],
  monthlyCheckInStatus: ["parent", "period", "on"],
  addMonthlyGoal: ["parent", "period", "input"],
  editMonthlyGoal: ["parent", "id", "input"],
  reviewMonthlyGoal: ["parent", "id", "input"],
  annualSummary: ["parent", "year"],
  annualPlan: ["parent", "year"],
  saveAnnualPlan: ["parent", "year", "input"],
  listPlans: ["parent", "kind"],
  createSprint: ["parent", "input"],
  updateSprintWeek: ["parent", "id", "week", "input"],
  createMilestone: ["parent", "input"],
  updateMilestone: ["parent", "id", "input"],
  addExperience: ["parent", "input"],
  completeExperience: ["parent", "id", "on", "notes"],
  addHabit: ["parent", "period", "input"],
  habitTracker: ["both", "period"],
  setHabitTick: ["child", "id", "on", "completed"],
};

const reads = new Set(["monthlyGoals", "monthlyCheckInStatus", "annualSummary", "annualPlan", "listPlans", "habitTracker"]);

export function createPortal({ supabase, setupCode = randomBytes(16).toString("hex"), publicOrigin }) {
  const assets = new Map([...staticFiles].map(([path, [type, file]]) =>
    [path, [type, readFileSync(fileURLToPath(new URL(file, import.meta.url)))]]));
  const attempts = new Map();

  function throttle(key) {
    const now = Date.now();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (entry.count >= 12) fail(429, "Too many attempts. Try again in a minute.");
    entry.count++;
    attempts.set(key, entry);
  }

  async function profile(account) {
    if (!account) return null;
    return {
      email: account.email, role: account.role,
      hasChild: account.role === "parent" && await supabase.hasChild(account.family_id),
    };
  }

  async function provision(email, secret, role, familyId) {
    try {
      await supabase.createAccount(email, secret, role, familyId);
    } catch (error) {
      if (["email_exists", "user_already_exists"].includes(error.code)) fail(409, "That email already has an account.");
      if (role === "child" && await supabase.hasChild(familyId)) fail(409, "This family already has a child sign-in.");
      if (error.upstreamStatus === 422) fail(400, "Supabase rejected the account details.");
      throw error;
    }
  }

  async function route(req, res, path) {
    const token = /(?:^|; *)orchard_session=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:;|$)/.exec(req.headers.cookie ?? "")?.[1];
    if (req.method === "GET" && path === "/api/session") {
      return { account: await profile(await supabase.identity(token)), areas: lifeAreas };
    }
    if (req.method !== "POST") fail(404, "Not found.");
    if (req.headers.origin !== (publicOrigin ?? `http://${req.headers.host}`)) fail(403, "Invalid request origin.");
    const input = await jsonBody(req);
    if (path === "/api/register" || path === "/api/login") {
      throttle(req.socket.remoteAddress);
      const email = emailAddress(input.email);
      const secret = password(input.password, path === "/api/login" ? 1 : 12);
      if (path === "/api/register") {
        if (!timingSafeEqual(Buffer.from(hash(String(input.setupCode ?? ""))), Buffer.from(hash(setupCode)))) {
          fail(403, "Enter your Orchard parent setup code.");
        }
        await provision(email, secret, "parent", randomUUID());
      }
      let session;
      try {
        session = await supabase.login(email, secret);
      } catch (error) {
        if ([400, 401, 422].includes(error.upstreamStatus)) fail(401, "Incorrect email or password.");
        if (error.upstreamStatus === 429) fail(429, "Too many sign-in attempts. Try again shortly.");
        throw error;
      }
      const account = await supabase.identity(session.access_token);
      if (!account) fail(403, "This account has no Orchard workspace.");
      res.setHeader("Set-Cookie", cookie(session.access_token, session.expires_in) + (publicOrigin ? "; Secure" : ""));
      return profile(account);
    }
    if (path === "/api/logout") {
      if (token) await supabase.logout(token).catch((error) => {
        if (![401, 403].includes(error.upstreamStatus)) throw error;
      });
      res.setHeader("Set-Cookie", cookie("", 0) + (publicOrigin ? "; Secure" : ""));
      return null;
    }
    const account = await supabase.identity(token);
    if (!account) fail(401, "Sign in to continue.");
    if (path === "/api/child") {
      if (account.role !== "parent") fail(403, "Only parents can create a child sign-in.");
      if (await supabase.hasChild(account.family_id)) fail(409, "This family already has a child sign-in.");
      await provision(emailAddress(input.email), password(input.password), "child", account.family_id);
      return profile(account);
    }
    if (path === "/api/goals" && typeof input.action === "string" && Object.hasOwn(calls, input.action)) {
      const [role, ...fields] = calls[input.action];
      if (role !== "both" && role !== account.role) fail(403, "This action is unavailable for your role.");
      let result;
      try { result = await supabase.goals(account, input.action, fields.map((field) => input[field]), !reads.has(input.action)); }
      catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) fail(400, error.message);
        throw error;
      }
      return result ?? null;
    }
    fail(404, "Not found.");
  }

  const handler = async (req, res, routedPath) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const host = req.headers.host ?? "";
    if (publicOrigin ? host !== new URL(publicOrigin).host : !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      res.writeHead(403).end();
      return;
    }
    const path = routedPath ?? new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && assets.has(path)) {
      const [type, content] = assets.get(path);
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }).end(content);
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      const result = await route(req, res, path);
      res.end(JSON.stringify({ result }));
    } catch (error) {
      res.statusCode = error.status ?? 500;
      if (!error.status) console.error(error);
      res.end(JSON.stringify({ error: error.status ? error.message : "Something went wrong." }));
    }
  };
  return { server: createServer(handler), handler, setupCode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const supabase = createSupabase({
    url: process.env.SUPABASE_URL,
    publicKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  });
  const { server, setupCode } = createPortal({ supabase, setupCode: process.env.ORCHARD_SETUP_CODE || undefined });
  server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1", () => {
    console.log(`Orchard portal at http://127.0.0.1:${server.address().port}\nParent setup code: ${setupCode}`);
  });
}

import { createHmac } from "node:crypto";
import { createPortal } from "../portal/server.mjs";
import { createSupabase } from "../portal/supabase.mjs";

let handler;
const routes = new Set(["session", "login", "register", "logout", "child", "goals"]);

export default function orchard(req, res) {
  const route = req.query?.route ?? new URL(req.url, "https://orchard-iota-blue.vercel.app").searchParams.get("route");
  if (!routes.has(route)) return res.writeHead(404).end();
  if (!handler) {
    const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: secretKey } = process.env;
    if (!url || !publicKey || !secretKey) {
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ error: "Orchard is being configured." }));
    }
    const supabase = createSupabase({ url, publicKey, secretKey });
    const setupCode = process.env.ORCHARD_SETUP_CODE ||
      createHmac("sha256", secretKey).update("orchard-production-parent-setup-v1").digest("hex").slice(0, 32);
    ({ handler } = createPortal({
      supabase, setupCode, publicOrigin: "https://orchard-iota-blue.vercel.app",
    }));
  }
  return handler(req, res, `/api/${route}`);
}

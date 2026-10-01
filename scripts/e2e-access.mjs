#!/usr/bin/env node
/*
 * End-to-end access test against a real `next start` server.
 *
 *   npm run build && npm run test:e2e
 *   BASE_URL=https://<deployment> E2E_REMOTE=1 npm run test:e2e   (black-box checks only)
 *
 * Locally it runs the production build with the file-backed entitlement
 * store, seeds accounts in known states, and verifies over HTTP that only
 * a server-side active entitlement opens the guide.
 */
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const REMOTE = process.env.E2E_REMOTE === "1";
const PORT = process.env.PORT || "3107";
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const SECRET = "e2e-secret-" + randomBytes(16).toString("hex");
const STORE_FILE = path.resolve(".data/e2e-store.json");
const PROTECTED = ["/guide", "/guide/dashboard", "/guide/roadmap", "/guide/gates"];
const PREMIUM_MARKERS = ["Train Your Eyes", "Discovery Certification", "Your investigation begins here"];

let failures = 0;
let passes = 0;
function check(name, ok, detail = "") {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  — " + detail : ""}`);
}

const acct = () => "acct_" + randomBytes(18).toString("base64url");
function cookieFor(accountId, secret = SECRET) {
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ v: 1, aid: accountId, iat, exp: iat + 3600 })).toString("base64url");
  return "gdg_session=" + body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}

async function get(p, cookie, extraHeaders = {}) {
  const res = await fetch(BASE + p, { redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...extraHeaders } });
  const body = await res.text();
  return { status: res.status, location: res.headers.get("location") || "", body, headers: res.headers };
}
async function post(p, payload, cookie, extraHeaders = {}) {
  const res = await fetch(BASE + p, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, setCookie: res.headers.get("set-cookie") || "" };
}

const isLocked = r => (r.status === 307 || r.status === 308 || r.status === 303) && /\/locked/.test(r.location);
const leaks = body => PREMIUM_MARKERS.some(m => body.includes(m));

// ------------------------------------------------------------------ seed
const A = acct(); // active
const B = acct(); // refunded
const C = acct(); // no entitlement
const D = acct(); // revoked live during the test
function ent(accountId, status, txn) {
  return JSON.stringify({ entitlement: "GEI_DISCOVERY_PREMIUM", productId: "GEI-DISCOVERY-50", status, purchaserId: accountId, transactionId: txn, grantedAt: new Date().toISOString(), source: "paypal", updatedAt: new Date().toISOString() });
}
function seed() {
  const data = {};
  for (const id of [A, B, C, D]) data[`gei:discovery:account:${id}`] = JSON.stringify({ accountId: id, createdAt: new Date().toISOString() });
  data[`gei:discovery:ent:${A}:GEI_DISCOVERY_PREMIUM`] = ent(A, "active", "CAP-A");
  data[`gei:discovery:ent:${B}:GEI_DISCOVERY_PREMIUM`] = ent(B, "refunded", "CAP-B");
  data[`gei:discovery:ent:${D}:GEI_DISCOVERY_PREMIUM`] = ent(D, "active", "CAP-D");
  // An entitlement for a different product must not open the Discovery guide.
  data[`gei:discovery:ent:${C}:GEI_MASTER`] = JSON.stringify({ entitlement: "GEI_MASTER", productId: "GEI-MASTER-69", status: "active", purchaserId: C, transactionId: "CAP-C", grantedAt: new Date().toISOString(), source: "paypal", updatedAt: new Date().toISOString() });
  mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { await fetch(BASE + "/"); return; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  throw new Error("server did not start");
}

async function blackBox() {
  console.log("\n# Visitor (no session)");
  for (const p of PROTECTED) {
    const r = await get(p);
    check(`visitor → ${p} is redirected to /locked`, isLocked(r), `${r.status} ${r.location}`);
    check(`visitor → ${p} receives no premium content`, !leaks(r.body));
  }
  const rsc = await get("/guide/dashboard", null, { RSC: "1" });
  check("visitor RSC request → /guide/dashboard is locked", isLocked(rsc) && !leaks(rsc.body), `${rsc.status}`);

  console.log("\n# Client manipulation");
  const junk = ["gdg_session=premium", "gdg_session=true; entitlement=GEI_DISCOVERY_PREMIUM; premium=1", cookieFor(acct(), "not-the-server-secret")];
  for (const c of junk) {
    const r = await get("/guide/dashboard", c);
    check(`forged cookie (${c.slice(0, 32)}…) is locked`, isLocked(r) && !leaks(r.body), `${r.status}`);
  }
  const qp = await get("/guide/dashboard?success=true&entitlement=GEI_DISCOVERY_PREMIUM&admin=1");
  check("URL parameters cannot unlock the guide", isLocked(qp) && !leaks(qp.body));

  console.log("\n# Fake success URL");
  for (const q of ["?success=true", "?success=true&orderId=FAKE&status=COMPLETED", ""]) {
    const r = await get("/purchase/success" + q);
    check(`/purchase/success${q} shows NOT VERIFIED, never ACCESS GRANTED`, r.status === 200 && /Payment not verified/i.test(r.body) && !/Access granted/i.test(r.body));
  }

  console.log("\n# Public pages");
  for (const p of ["/", "/preview", "/purchase", "/locked", "/restore"]) {
    const r = await get(p);
    check(`${p} is public (200)`, r.status === 200, `${r.status}`);
  }
  const landing = await get("/");
  check("landing shows the $50 offer + CTAs", /Unlock for \$50/i.test(landing.body) && /Enter the Discovery Guide/i.test(landing.body) && /See what/i.test(landing.body));
  const locked = await get("/locked");
  check("locked screen copy", /This gate is locked/i.test(locked.body) && /Unlock the DAM Guide — \$50/i.test(locked.body) && /Return to preview/i.test(locked.body));
  check("locked screen exposes no implementation details", !/entitlement lookup|stack|redis|paypal error/i.test(locked.body));
  check("security headers present", !!landing.headers.get("content-security-policy") && landing.headers.get("x-frame-options") === "DENY");

  console.log("\n# APIs");
  const e = await get("/api/entitlement");
  check("/api/entitlement for visitor → none", e.status === 200 && JSON.parse(e.body).status === "none", e.body);
  const a = await get("/api/access");
  check("/api/access for visitor → denied", JSON.parse(a.body).access === "denied", a.body);
  const wh = await post("/api/webhooks/paypal", { id: "WH-FAKE", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "X", supplementary_data: { related_ids: { order_id: "Y" } } } });
  check("unsigned webhook is rejected (4xx/5xx, never 200)", wh.status >= 400, `${wh.status}`);
  const cap = await post("/api/checkout/capture", { orderId: "FAKEORDER123" });
  check("capture without a session grants nothing", cap.status >= 400 && cap.json?.state !== "active", `${cap.status}`);
  const xsite = await post("/api/checkout/order", {}, null, { origin: "https://evil.example" });
  check("cross-site checkout POST is refused", xsite.status === 403, `${xsite.status}`);
}

async function seededChecks() {
  console.log("\n# Customer with active GEI_DISCOVERY_PREMIUM");
  for (const p of PROTECTED) {
    const r = await get(p, cookieFor(A));
    check(`customer → ${p} is 200 with premium content`, r.status === 200 && leaks(r.body), `${r.status} ${r.location}`);
    check(`customer → ${p} is not cacheable`, /no-store/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control") || "");
  }
  const again = await get("/guide/dashboard", cookieFor(A));
  check("refresh keeps legitimate access", again.status === 200 && leaks(again.body));
  const welcome = await get("/guide/dashboard", cookieFor(A));
  check("dashboard shows WELCOME + roadmap + COMING IN GUIDE BUILD", /Welcome to the DAM Guide/i.test(welcome.body) && /GEI Discovery Roadmap/i.test(welcome.body) && /COMING IN GUIDE BUILD/.test(welcome.body));
  const s = await get("/purchase/success", cookieFor(A));
  check("success page shows ACCESS GRANTED for a verified customer", /Access granted/i.test(s.body) && /Flow authorized/i.test(s.body));
  const api = await get("/api/entitlement", cookieFor(A));
  const apiJson = JSON.parse(api.body);
  check("/api/entitlement → active, no payment data", apiJson.status === "active" && !("transactionId" in apiJson) && !api.body.includes("CAP-A"), api.body);

  console.log("\n# Accounts without an active Discovery entitlement");
  for (const [label, id] of [["no entitlement", C], ["refunded", B]]) {
    for (const p of PROTECTED) {
      const r = await get(p, cookieFor(id));
      check(`${label} → ${p} is locked`, isLocked(r) && !leaks(r.body), `${r.status}`);
    }
    const r = await get("/guide/gates", cookieFor(id), { RSC: "1" });
    check(`${label} RSC request → /guide/gates leaks nothing`, !leaks(r.body), `${r.status}`);
    const s2 = await get("/purchase/success?success=true", cookieFor(id));
    check(`${label} + fake success URL → no access`, !/Access granted/i.test(s2.body));
  }
  check("an active GEI_MASTER entitlement does NOT open the Discovery guide", isLocked(await get("/guide", cookieFor(C))));

  console.log("\n# Revocation takes effect on the next request");
  check("D has access before revocation", (await get("/guide/dashboard", cookieFor(D))).status === 200);
  const data = JSON.parse(readFileSync(STORE_FILE, "utf8"));
  const key = `gei:discovery:ent:${D}:GEI_DISCOVERY_PREMIUM`;
  data[key] = JSON.stringify({ ...JSON.parse(data[key]), status: "revoked", revokedAt: new Date().toISOString() });
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  check("D is locked immediately after revocation", isLocked(await get("/guide/dashboard", cookieFor(D))));

  console.log("\n# Access key restore (new device)");
  const issued = await post("/api/access/key", {}, cookieFor(A));
  check("customer can issue an access key", issued.status === 200 && /^GEI-/.test(issued.json?.accessKey || ""), issued.text);
  const denied = await post("/api/access/key", {}, cookieFor(C));
  check("non-customer cannot issue an access key", denied.status === 403);
  const restored = await post("/api/access/restore", { accessKey: issued.json?.accessKey });
  const newCookie = (restored.setCookie.match(/gdg_session=[^;]+/) || [""])[0];
  check("restore sets a session for the purchasing account", restored.status === 200 && !!newCookie);
  check("restored device can enter the guide", (await get("/guide/dashboard", newCookie)).status === 200);
  const bad = await post("/api/access/restore", { accessKey: "GEI-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE" });
  check("wrong access key restores nothing", bad.status === 400 && !bad.setCookie);
}

let server;
try {
  if (!REMOTE) {
    rmSync(STORE_FILE, { force: true });
    seed();
    server = spawn("npx", ["next", "start", "-p", PORT], {
      env: { ...process.env, ENTITLEMENT_STORE: "file", ENTITLEMENT_STORE_FILE: STORE_FILE, ENTITLEMENT_SESSION_SECRET: SECRET, PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "", PAYPAL_WEBHOOK_ID: "", VERCEL: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", () => {});
    server.stderr.on("data", () => {});
    await waitForServer();
  }
  console.log(`E2E against ${BASE}${REMOTE ? " (remote, black-box)" : ""}`);
  await blackBox();
  if (!REMOTE) await seededChecks();
  if (!REMOTE) {
    const data = JSON.parse(readFileSync(STORE_FILE, "utf8"));
    const ents = Object.keys(data).filter(k => k.includes(":ent:") && k.endsWith(":GEI_DISCOVERY_PREMIUM"));
    check("no entitlement was created by any of the attacks above", ents.length === 3, String(ents.length));
  }
} catch (err) {
  failures++;
  console.error("E2E error:", err);
} finally {
  server?.kill("SIGTERM");
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

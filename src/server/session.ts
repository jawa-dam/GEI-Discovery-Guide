import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Account session cookie.
 *
 * The cookie identifies an ACCOUNT, never a permission. It carries only a
 * random account id, signed with ENTITLEMENT_SESSION_SECRET so it cannot be
 * forged or altered. Whether that account may enter the guide is decided by
 * looking up its entitlement in the server-side store on every request.
 * Editing the cookie, localStorage or URL can therefore never unlock access.
 */

export const SESSION_COOKIE = "gdg_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9_-]{22,64}$/;

export interface SessionPayload {
  v: 1;
  aid: string;
  iat: number;
  exp: number;
}

export function newAccountId(): string {
  return "acct_" + randomBytes(18).toString("base64url");
}

export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value);
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function encodeSession(accountId: string, secret: string, now = Date.now()): string {
  if (!isAccountId(accountId)) throw new Error("Invalid account id.");
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { v: 1, aid: accountId, iat, exp: iat + SESSION_MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + sign(body, secret);
}

/** Returns the account id for a valid, unexpired, correctly signed cookie — otherwise null. */
export function decodeSession(value: string | undefined | null, secret: string, now = Date.now()): string | null {
  if (!value || typeof value !== "string" || value.length > 512) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.v !== 1 || !isAccountId(payload.aid)) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
    return payload.aid;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

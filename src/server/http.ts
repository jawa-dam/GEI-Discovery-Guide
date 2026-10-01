import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionSecret } from "./config";
import { ensureAccount } from "./entitlements";
import { decodeSession, encodeSession, newAccountId, SESSION_COOKIE, sessionCookieOptions } from "./session";
import { getStore } from "./store";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

/** Rejects cross-site browser POSTs (defence in depth on top of SameSite=Lax). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function currentAccountId(): Promise<string | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
}

/** Returns the session's account, creating an anonymous account + cookie when absent. */
export async function currentOrNewAccountId(): Promise<string> {
  const existing = await currentAccountId();
  if (existing) return existing;
  const accountId = newAccountId();
  await ensureAccount(getStore(), accountId);
  await setSessionAccount(accountId);
  return accountId;
}

export async function setSessionAccount(accountId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(accountId, sessionSecret()), sessionCookieOptions());
}

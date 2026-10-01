import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { EntitlementId } from "@/lib/catalog";
import { sessionSecret } from "./config";
import { getEntitlement, isActive, type EntitlementRecord } from "./entitlements";
import { errorMessage, log } from "./log";
import { decodeSession, SESSION_COOKIE } from "./session";
import { getStore } from "./store";

/*
 * THE authorization authority. Every protected page, layout and API route
 * calls requireEntitlement() / getAccess(); nothing else decides access.
 *
 * Access = a correctly signed session cookie naming an account
 *        + an `active` entitlement record for that account in the
 *          server-side store, read fresh on every request.
 */

export type AccessResult =
  | { state: "granted"; accountId: string; entitlement: EntitlementRecord }
  | { state: "denied"; accountId: string | null; reason: "NO_SESSION" | "NO_ENTITLEMENT" | "INACTIVE" }
  | { state: "unavailable"; accountId: string | null };

export const getSessionAccountId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  try {
    return decodeSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
  } catch (err) {
    log("error", "config.error", { area: "session", message: errorMessage(err) });
    return null;
  }
});

/** Request-scoped (React cache) so layout + page share one lookup per render. */
export const getAccess = cache(async (entitlement: EntitlementId): Promise<AccessResult> => {
  const accountId = await getSessionAccountId();
  if (!accountId) return { state: "denied", accountId: null, reason: "NO_SESSION" };
  try {
    const record = await getEntitlement(getStore(), accountId, entitlement);
    if (!record) return { state: "denied", accountId, reason: "NO_ENTITLEMENT" };
    if (!isActive(record)) return { state: "denied", accountId, reason: "INACTIVE" };
    if (record.purchaserId !== accountId || record.entitlement !== entitlement) {
      log("error", "entitlement.unexpected_state", { reason: "RECORD_IDENTITY_MISMATCH", accountId, entitlement });
      return { state: "denied", accountId, reason: "INACTIVE" };
    }
    return { state: "granted", accountId, entitlement: record };
  } catch (err) {
    log("error", "config.error", { area: "entitlement-store", message: errorMessage(err) });
    return { state: "unavailable", accountId };
  }
});

const logDecision = cache((path: string, entitlement: EntitlementId, result: AccessResult) => {
  if (result.state === "granted") {
    log("info", "access.granted", { path, entitlement, accountId: result.accountId });
  } else {
    log("warn", "access.denied", {
      path,
      entitlement,
      accountId: result.accountId,
      reason: result.state === "denied" ? result.reason : "STORE_UNAVAILABLE"
    });
  }
  return true;
});

/**
 * Server-side gate for protected content. Redirects before any premium
 * markup is rendered or streamed when the entitlement is not active.
 */
export async function requireEntitlement(entitlement: EntitlementId, path: string) {
  const result = await getAccess(entitlement);
  logDecision(path, entitlement, result);
  if (result.state === "unavailable") redirect("/locked?r=busy");
  if (result.state !== "granted") redirect("/locked");
  return result;
}

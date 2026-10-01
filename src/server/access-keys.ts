import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ensureAccount, getAccount, keys, updateAccount } from "./entitlements";
import type { KeyValueStore } from "./store/types";

/*
 * Access keys let a customer restore their account on a new device or
 * after clearing cookies. A key is 120 random bits, shown once, and stored
 * only as a SHA-256 hash. Issuing a new key invalidates the previous one.
 * A key restores the ACCOUNT; access is still decided by its entitlement.
 */

const KEY_PATTERN = /^GEI(-[A-Z2-9]{5}){5}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeAccessKey(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact.startsWith("GEI") || compact.length !== 28) return null;
  const body = compact.slice(3);
  const formatted = "GEI-" + body.match(/.{5}/g)!.join("-");
  return KEY_PATTERN.test(formatted) ? formatted : null;
}

function hashKey(key: string): string {
  return createHash("sha256").update("gei-discovery-access-key:" + key).digest("hex");
}

function generateKey(): string {
  const bytes = randomBytes(25);
  let out = "";
  for (let i = 0; i < 25; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return "GEI-" + out.match(/.{5}/g)!.join("-");
}

export async function issueAccessKey(store: KeyValueStore, accountId: string): Promise<string> {
  const account = await ensureAccount(store, accountId);
  const key = generateKey();
  const hash = hashKey(key);
  await store.set(keys.accessKey(hash), accountId);
  if (account.accessKeyHash) await store.set(keys.accessKey(account.accessKeyHash), "revoked");
  await updateAccount(store, accountId, { accessKeyHash: hash });
  return key;
}

export async function resolveAccessKey(store: KeyValueStore, input: unknown): Promise<string | null> {
  const key = normalizeAccessKey(input);
  if (!key) return null;
  const hash = hashKey(key);
  const accountId = await store.get(keys.accessKey(hash));
  if (!accountId || accountId === "revoked") return null;
  const account = await getAccount(store, accountId);
  return account?.accessKeyHash === hash ? accountId : null;
}

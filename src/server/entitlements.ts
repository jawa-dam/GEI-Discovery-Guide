import "server-only";
import { getActiveProduct, type EntitlementId } from "@/lib/catalog";
import { log } from "./log";
import type { KeyValueStore } from "./store/types";

/*
 * The GEI entitlement ledger.
 *
 *   order        — a checkout this server created for an account (pending → paid → active | failed)
 *   transaction  — one VERIFIED PayPal capture. Keyed by capture id; created with
 *                  SET NX, so a capture can be recorded exactly once no matter how
 *                  many times the capture route or webhook replays it.
 *   entitlement  — the account-level permission, one record per (account, entitlement).
 *
 * Only grantEntitlement() creates an active entitlement, and it is only ever
 * called with a capture that was verified against PayPal's API server-side.
 */

export type PurchaseStatus = "pending" | "paid" | "active" | "failed" | "refunded" | "revoked";
export type EntitlementStatus = "active" | "refunded" | "revoked";

export interface OrderRecord {
  orderId: string;
  accountId: string;
  productId: string;
  entitlement: EntitlementId;
  amount: string;
  currency: string;
  invoiceId: string;
  status: PurchaseStatus;
  captureId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRecord {
  transactionId: string;
  orderId: string;
  accountId: string;
  productId: string;
  entitlement: EntitlementId;
  amount: string;
  currency: string;
  payerId: string | null;
  source: "paypal";
  status: "paid" | "refunded" | "revoked";
  verifiedAt: string;
  updatedAt: string;
}

export interface EntitlementRecord {
  entitlement: EntitlementId;
  productId: string;
  status: EntitlementStatus;
  purchaserId: string;
  transactionId: string;
  grantedAt: string;
  source: "paypal";
  updatedAt: string;
  revokedAt?: string;
  revokeReason?: string;
}

export interface AccountRecord {
  accountId: string;
  createdAt: string;
  lastOrderId?: string;
  accessKeyHash?: string;
}

/** A capture whose order, amount, currency and COMPLETED status were confirmed with PayPal's API. */
export interface VerifiedCapture {
  captureId: string;
  orderId: string;
  accountId: string;
  productId: string;
  amount: string;
  currency: string;
  payerId: string | null;
}

const NS = "gei:discovery:";
export const keys = {
  account: (accountId: string) => `${NS}account:${accountId}`,
  order: (orderId: string) => `${NS}order:${orderId}`,
  transaction: (captureId: string) => `${NS}txn:${captureId}`,
  entitlement: (accountId: string, entitlement: EntitlementId) => `${NS}ent:${accountId}:${entitlement}`,
  event: (eventId: string) => `${NS}event:${eventId}`,
  accessKey: (hash: string) => `${NS}accesskey:${hash}`
};

export const EVENT_DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 90;
/** A transaction without its entitlement is only "half-written" once no grant can still be in flight. */
const REPAIR_AFTER_MS = 30_000;

export class WrongProductError extends Error {
  constructor() {
    super("Transaction does not match an active GEI product.");
    this.name = "WrongProductError";
  }
}

async function readJson<T>(store: KeyValueStore, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    log("error", "entitlement.unexpected_state", { reason: "CORRUPT_RECORD", key });
    return null;
  }
}

async function writeJson(store: KeyValueStore, key: string, value: unknown, ttlSeconds?: number) {
  await store.set(key, JSON.stringify(value), ttlSeconds);
}

/* ------------------------------------------------------------------ accounts */

export async function getAccount(store: KeyValueStore, accountId: string) {
  return readJson<AccountRecord>(store, keys.account(accountId));
}

export async function ensureAccount(store: KeyValueStore, accountId: string): Promise<AccountRecord> {
  const now = new Date().toISOString();
  const fresh: AccountRecord = { accountId, createdAt: now };
  await store.setIfAbsent(keys.account(accountId), JSON.stringify(fresh));
  return (await getAccount(store, accountId)) || fresh;
}

export async function updateAccount(store: KeyValueStore, accountId: string, patch: Partial<AccountRecord>) {
  const current = await ensureAccount(store, accountId);
  const next = { ...current, ...patch, accountId };
  await writeJson(store, keys.account(accountId), next);
  return next;
}

/* -------------------------------------------------------------------- orders */

export async function getOrder(store: KeyValueStore, orderId: string) {
  return readJson<OrderRecord>(store, keys.order(orderId));
}

export async function recordPendingOrder(
  store: KeyValueStore,
  order: Omit<OrderRecord, "status" | "createdAt" | "updatedAt">
): Promise<OrderRecord> {
  const now = new Date().toISOString();
  const record: OrderRecord = { ...order, status: "pending", createdAt: now, updatedAt: now };
  const created = await store.setIfAbsent(keys.order(order.orderId), JSON.stringify(record));
  if (!created) {
    const existing = await getOrder(store, order.orderId);
    if (existing) return existing;
  }
  await updateAccount(store, order.accountId, { lastOrderId: order.orderId });
  return record;
}

const ORDER_RANK: Record<PurchaseStatus, number> = {
  pending: 0,
  failed: 1,
  paid: 2,
  active: 3,
  refunded: 4,
  revoked: 4
};

/** Moves an order forward. A late "pending"/"failed" signal never downgrades a paid order. */
export async function advanceOrder(store: KeyValueStore, orderId: string, status: PurchaseStatus, captureId?: string) {
  const order = await getOrder(store, orderId);
  if (!order) return null;
  if (ORDER_RANK[status] < ORDER_RANK[order.status]) return order;
  const next: OrderRecord = {
    ...order,
    status,
    captureId: captureId || order.captureId,
    updatedAt: new Date().toISOString()
  };
  await writeJson(store, keys.order(orderId), next);
  return next;
}

/* -------------------------------------------------------------- entitlements */

export async function getEntitlement(store: KeyValueStore, accountId: string, entitlement: EntitlementId) {
  return readJson<EntitlementRecord>(store, keys.entitlement(accountId, entitlement));
}

export function isActive(record: EntitlementRecord | null): boolean {
  return !!record && record.status === "active";
}

export type GrantOutcome = "created" | "duplicate" | "repaired";

/**
 * Idempotently grants the product's entitlement for a verified capture.
 * Replays (same capture via webhook retries, the capture route, or both)
 * resolve to the existing records and never create a second entitlement.
 */
export async function grantEntitlement(
  store: KeyValueStore,
  capture: VerifiedCapture,
  context: { via: "capture" | "webhook"; eventId?: string }
): Promise<{ outcome: GrantOutcome; entitlement: EntitlementRecord | null }> {
  const product = getActiveProduct(capture.productId);
  if (!product || capture.amount !== product.price || capture.currency !== product.currency) {
    log("warn", "entitlement.wrong_product", {
      via: context.via,
      productId: capture.productId,
      amount: capture.amount,
      currency: capture.currency,
      captureId: capture.captureId
    });
    throw new WrongProductError();
  }

  const now = new Date().toISOString();
  const txn: TransactionRecord = {
    transactionId: capture.captureId,
    orderId: capture.orderId,
    accountId: capture.accountId,
    productId: product.productId,
    entitlement: product.entitlement,
    amount: product.price,
    currency: product.currency,
    payerId: capture.payerId,
    source: "paypal",
    status: "paid",
    verifiedAt: now,
    updatedAt: now
  };

  const created = await store.setIfAbsent(keys.transaction(capture.captureId), JSON.stringify(txn));
  const entKey = keys.entitlement(capture.accountId, product.entitlement);

  if (!created) {
    const existingTxn = await readJson<TransactionRecord>(store, keys.transaction(capture.captureId));
    const existingEnt = existingTxn ? await getEntitlement(store, existingTxn.accountId, existingTxn.entitlement) : null;
    const stale = existingTxn && Date.now() - Date.parse(existingTxn.verifiedAt) > REPAIR_AFTER_MS;
    if (existingTxn && existingTxn.status === "paid" && !existingEnt && stale) {
      // A previous attempt recorded the transaction but died before writing
      // the entitlement. Converge instead of leaving a paid customer locked out.
      const repaired = entitlementFor(existingTxn, now);
      const wrote = await store.setIfAbsent(keys.entitlement(existingTxn.accountId, existingTxn.entitlement), JSON.stringify(repaired));
      await advanceOrder(store, existingTxn.orderId, "active", existingTxn.transactionId);
      if (wrote) log("warn", "entitlement.repaired", { via: context.via, captureId: capture.captureId, accountId: existingTxn.accountId });
      return { outcome: "repaired", entitlement: await getEntitlement(store, existingTxn.accountId, existingTxn.entitlement) };
    }
    log("info", "entitlement.duplicate", {
      via: context.via,
      eventId: context.eventId,
      captureId: capture.captureId,
      accountId: existingTxn?.accountId,
      transactionStatus: existingTxn?.status
    });
    return { outcome: "duplicate", entitlement: existingEnt };
  }

  await advanceOrder(store, capture.orderId, "paid", capture.captureId);

  const existing = await getEntitlement(store, capture.accountId, product.entitlement);
  let record: EntitlementRecord;
  if (isActive(existing)) {
    // The account already holds this entitlement from an earlier purchase.
    // Keep one entitlement; the extra transaction stays in the ledger for support/refund.
    record = existing as EntitlementRecord;
    log("warn", "entitlement.duplicate", {
      via: context.via,
      reason: "ALREADY_ACTIVE_FROM_OTHER_TRANSACTION",
      captureId: capture.captureId,
      existingTransactionId: record.transactionId,
      accountId: capture.accountId
    });
  } else {
    record = entitlementFor(txn, now);
    // No record yet → atomic create. An inactive record (refunded earlier) → replace with the new purchase.
    if (existing) await writeJson(store, entKey, record);
    else if (!(await store.setIfAbsent(entKey, JSON.stringify(record)))) {
      record = (await getEntitlement(store, capture.accountId, product.entitlement)) as EntitlementRecord;
    }
    log("info", "entitlement.created", {
      via: context.via,
      eventId: context.eventId,
      entitlement: record.entitlement,
      productId: record.productId,
      accountId: capture.accountId,
      captureId: capture.captureId
    });
  }

  await advanceOrder(store, capture.orderId, "active", capture.captureId);
  return { outcome: "created", entitlement: record };
}

function entitlementFor(txn: TransactionRecord, now: string): EntitlementRecord {
  return {
    entitlement: txn.entitlement,
    productId: txn.productId,
    status: "active",
    purchaserId: txn.accountId,
    transactionId: txn.transactionId,
    grantedAt: now,
    source: "paypal",
    updatedAt: now
  };
}

/**
 * Refund / reversal pathway. Marks the transaction and, if this capture is
 * the one backing the account's entitlement, the entitlement as refunded or
 * revoked. Access ends on the very next request.
 */
export async function revokeForCapture(
  store: KeyValueStore,
  captureId: string,
  status: "refunded" | "revoked",
  reason: string
): Promise<{ revoked: boolean; known: boolean }> {
  const txn = await readJson<TransactionRecord>(store, keys.transaction(captureId));
  if (!txn) return { revoked: false, known: false };

  const now = new Date().toISOString();
  if (txn.status === "paid") {
    await writeJson(store, keys.transaction(captureId), { ...txn, status, updatedAt: now });
  }
  await advanceOrder(store, txn.orderId, status, captureId);

  const ent = await getEntitlement(store, txn.accountId, txn.entitlement);
  if (!ent || ent.transactionId !== captureId || ent.status !== "active") {
    log("warn", "entitlement.unexpected_state", {
      reason: "REVOCATION_TARGET_NOT_ACTIVE",
      captureId,
      accountId: txn.accountId,
      entitlementStatus: ent?.status ?? null
    });
    return { revoked: false, known: true };
  }

  await writeJson(store, keys.entitlement(txn.accountId, txn.entitlement), {
    ...ent,
    status,
    revokedAt: now,
    revokeReason: reason,
    updatedAt: now
  } satisfies EntitlementRecord);
  log("warn", "entitlement.revoked", { captureId, accountId: txn.accountId, status, reason });
  return { revoked: true, known: true };
}

/*
 * Webhook event ledger. An event is marked only AFTER it was handled, so a
 * failure mid-processing lets PayPal's retry try again. Correctness never
 * depends on this check alone — the transaction SET NX above is the real
 * idempotency guarantee; this just short-circuits known replays.
 */
export async function isEventProcessed(store: KeyValueStore, eventId: string): Promise<boolean> {
  return (await store.get(keys.event(eventId))) !== null;
}

export async function markEventProcessed(store: KeyValueStore, eventId: string, outcome: string): Promise<void> {
  await store.set(keys.event(eventId), JSON.stringify({ outcome, at: new Date().toISOString() }), EVENT_DEDUPE_TTL_SECONDS);
}

import { beforeEach, describe, expect, it } from "vitest";
import { DISCOVERY_PREMIUM, DISCOVERY_PRODUCT_ID } from "@/lib/catalog";
import {
  getEntitlement,
  getOrder,
  grantEntitlement,
  isActive,
  keys,
  WrongProductError,
  type TransactionRecord
} from "@/server/entitlements";
import { setLogSink } from "@/server/log";
import { captureCheckoutOrder, createCheckoutOrder, processPayPalWebhook, type PaymentDeps } from "@/server/payments";
import { newAccountId } from "@/server/session";
import { MemoryStore } from "@/server/store/memory";
import { captureCompletedEvent, FakePayPal, refundEvent, signed, unsigned } from "./fake-paypal";

let store: MemoryStore;
let paypal: FakePayPal;
let deps: PaymentDeps;
let logs: Array<{ event: string; [k: string]: unknown }>;

beforeEach(() => {
  store = new MemoryStore();
  paypal = new FakePayPal();
  deps = { store, paypal };
  logs = [];
  setLogSink(line => logs.push(JSON.parse(line)));
});

function entitlementKeys() {
  return [...store.data.keys()].filter(k => k.startsWith("gei:discovery:ent:"));
}

async function purchase(accountId = newAccountId()) {
  const created = await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID);
  if (!created.ok) throw new Error("order not created");
  paypal.approve(created.orderId);
  const state = await captureCheckoutOrder(deps, accountId, created.orderId);
  const order = await getOrder(store, created.orderId);
  return { accountId, orderId: created.orderId, state, captureId: order?.captureId as string };
}

describe("checkout → verified capture → entitlement", () => {
  it("grants GEI_DISCOVERY_PREMIUM to the purchasing account after server-side verification", async () => {
    const { accountId, orderId, state, captureId } = await purchase();
    expect(state).toBe("active");

    const ent = await getEntitlement(store, accountId, DISCOVERY_PREMIUM);
    expect(ent).toMatchObject({
      entitlement: "GEI_DISCOVERY_PREMIUM",
      productId: "GEI-DISCOVERY-50",
      status: "active",
      purchaserId: accountId,
      transactionId: captureId,
      source: "paypal"
    });
    expect(typeof ent?.grantedAt).toBe("string");
    expect((await getOrder(store, orderId))?.status).toBe("active");
    expect(logs.map(l => l.event)).toContain("entitlement.created");
  });

  it("creates the PayPal order at the catalog price — the client cannot choose the amount", async () => {
    const accountId = newAccountId();
    const created = await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID);
    expect(created.ok).toBe(true);
    const order = await paypal.getOrder((created as { orderId: string }).orderId);
    expect(order.purchase_units?.[0]).toMatchObject({ custom_id: "GEI-DISCOVERY-50", amount: { currency_code: "USD", value: "50.00" } });
  });

  it("refuses to create orders for unknown or inactive products", async () => {
    for (const productId of ["GEI-MASTER-69", "GEI-PREMIUM-99", "GEI-DISCOVERY-10", "__proto__", "x"]) {
      const result = await createCheckoutOrder(deps, newAccountId(), productId);
      expect(result.ok).toBe(false);
    }
    expect(paypal.orders.size).toBe(0);
  });

  it("does not grant anything for an order that was never paid (fake success)", async () => {
    const accountId = newAccountId();
    const created = await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID);
    const state = await captureCheckoutOrder(deps, accountId, (created as { orderId: string }).orderId);
    expect(state).toBe("pending");
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
  });

  it("will not verify another account's order", async () => {
    const owner = newAccountId();
    const attacker = newAccountId();
    const created = await createCheckoutOrder(deps, owner, DISCOVERY_PRODUCT_ID);
    paypal.approve((created as { orderId: string }).orderId);
    expect(await captureCheckoutOrder(deps, attacker, (created as { orderId: string }).orderId)).toBe("not_found");
    expect(await getEntitlement(store, attacker, DISCOVERY_PREMIUM)).toBeNull();
  });

  it("keeps a pending capture locked", async () => {
    paypal.nextCaptureStatus = "PENDING";
    const { accountId, orderId, state } = await purchase();
    expect(state).toBe("pending");
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
    expect((await getOrder(store, orderId))?.status).toBe("pending");
  });

  it("marks a declined capture failed with no entitlement", async () => {
    paypal.nextCaptureStatus = "DECLINED";
    const { accountId, orderId, state } = await purchase();
    expect(state).toBe("failed");
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
    expect((await getOrder(store, orderId))?.status).toBe("failed");
  });
});

describe("wrong product", () => {
  it("does not grant when PayPal's order carries another product id", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.mutate(created.orderId, o => (o.purchase_units![0].custom_id = "single"));
    paypal.approve(created.orderId);
    expect(await captureCheckoutOrder(deps, accountId, created.orderId)).toBe("failed");
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
  });

  it("does not grant when the paid amount differs from the catalog price", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.mutate(created.orderId, o => (o.purchase_units![0].amount = { currency_code: "USD", value: "6.00" }));
    paypal.approve(created.orderId);
    expect(await captureCheckoutOrder(deps, accountId, created.orderId)).toBe("failed");
    expect(entitlementKeys()).toHaveLength(0);
  });

  it("the ledger itself rejects a capture for any non-Discovery product", async () => {
    await expect(
      grantEntitlement(store, { captureId: "C1", orderId: "O1", accountId: newAccountId(), productId: "GEI-MASTER-69", amount: "69.00", currency: "USD", payerId: null }, { via: "webhook" })
    ).rejects.toBeInstanceOf(WrongProductError);
    expect(entitlementKeys()).toHaveLength(0);
  });

  it("ignores webhooks for orders this app did not create (e.g. GEI game purchases)", async () => {
    const res = await processPayPalWebhook(deps, captureCompletedEvent("WH-GAME", "GAME-ORDER", "GAME-CAPTURE"), signed());
    expect(res).toEqual({ status: 200, body: { received: true, outcome: "ignored" } });
    expect(entitlementKeys()).toHaveLength(0);
  });
});

describe("webhook verification and replay protection", () => {
  it("rejects an unsigned/forged webhook and grants nothing", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.approve(created.orderId);
    await paypal.captureOrder(created.orderId);
    const captureId = (await paypal.getOrder(created.orderId)).purchase_units![0].payments!.captures![0].id;

    const res = await processPayPalWebhook(deps, captureCompletedEvent("WH-1", created.orderId, captureId), unsigned());
    expect(res.status).toBe(400);
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
    expect(logs.map(l => l.event)).toContain("webhook.signature_invalid");
  });

  it("rejects malformed bodies", async () => {
    expect((await processPayPalWebhook(deps, "{not json", signed())).status).toBe(400);
  });

  it("a signed webhook for a fabricated capture grants nothing (re-verified against PayPal)", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    const res = await processPayPalWebhook(deps, captureCompletedEvent("WH-FAKE", created.orderId, "MADE-UP"), signed());
    expect(res.status).toBe(200);
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
  });

  it("grants from the webhook alone when the browser never returned", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.approve(created.orderId);
    const approved = JSON.stringify({ id: "WH-APPROVED", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: created.orderId } });
    const res = await processPayPalWebhook(deps, approved, signed());
    expect(res.body.outcome).toBe("active");
    expect(isActive(await getEntitlement(store, accountId, DISCOVERY_PREMIUM))).toBe(true);
  });

  it("the same verified event delivered twice yields ONE entitlement", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.approve(created.orderId);
    await paypal.captureOrder(created.orderId);
    const captureId = (await paypal.getOrder(created.orderId)).purchase_units![0].payments!.captures![0].id;
    const body = captureCompletedEvent("WH-DUP", created.orderId, captureId);

    const first = await processPayPalWebhook(deps, body, signed());
    const firstEnt = await getEntitlement(store, accountId, DISCOVERY_PREMIUM);
    const second = await processPayPalWebhook(deps, body, signed());
    const third = await processPayPalWebhook(deps, body, signed());

    expect(first.body.outcome).toBe("active");
    expect(second.body).toMatchObject({ duplicate: true });
    expect(third.body).toMatchObject({ duplicate: true });
    expect(entitlementKeys()).toHaveLength(1);
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toEqual(firstEnt);
    expect([...store.data.keys()].filter(k => k.startsWith("gei:discovery:txn:"))).toHaveLength(1);
    expect(logs.filter(l => l.event === "webhook.duplicate")).toHaveLength(2);
  });

  it("capture route + webhook (different event ids, same capture) resolve to the same entitlement", async () => {
    const { accountId, orderId, captureId } = await purchase();
    const before = await getEntitlement(store, accountId, DISCOVERY_PREMIUM);
    for (const id of ["WH-A", "WH-B", "WH-C"]) {
      await processPayPalWebhook(deps, captureCompletedEvent(id, orderId, captureId), signed());
    }
    expect(entitlementKeys()).toHaveLength(1);
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toEqual(before);
    expect(logs.filter(l => l.event === "entitlement.created")).toHaveLength(1);
    expect(logs.filter(l => l.event === "entitlement.duplicate")).toHaveLength(3);
  });

  it("concurrent deliveries of the same capture still create one entitlement", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.approve(created.orderId);
    await paypal.captureOrder(created.orderId);
    const captureId = (await paypal.getOrder(created.orderId)).purchase_units![0].payments!.captures![0].id;
    await Promise.all(
      ["X1", "X2", "X3", "X4"].map(id => processPayPalWebhook(deps, captureCompletedEvent(id, created.orderId, captureId), signed()))
    );
    expect(entitlementKeys()).toHaveLength(1);
    expect(logs.filter(l => l.event === "entitlement.created")).toHaveLength(1);
  });

  it("repairs a half-written grant on replay instead of locking out a paid customer", async () => {
    const { accountId, orderId, captureId } = await purchase();
    store.data.delete(keys.entitlement(accountId, DISCOVERY_PREMIUM));
    // A grant may still be in flight right after the transaction is written: no repair yet.
    await processPayPalWebhook(deps, captureCompletedEvent("WH-EARLY", orderId, captureId), signed());
    expect(await getEntitlement(store, accountId, DISCOVERY_PREMIUM)).toBeNull();
    // Once it is clearly stale, a replay repairs it.
    const txnKey = keys.transaction(captureId);
    const txn = JSON.parse((await store.get(txnKey))!);
    await store.set(txnKey, JSON.stringify({ ...txn, verifiedAt: new Date(Date.now() - 60_000).toISOString() }));
    await processPayPalWebhook(deps, captureCompletedEvent("WH-REPAIR", orderId, captureId), signed());
    expect(isActive(await getEntitlement(store, accountId, DISCOVERY_PREMIUM))).toBe(true);
    expect(logs.map(l => l.event)).toContain("entitlement.repaired");
  });

  it("a failed handler does not mark the event processed, so PayPal's retry succeeds", async () => {
    const accountId = newAccountId();
    const created = (await createCheckoutOrder(deps, accountId, DISCOVERY_PRODUCT_ID)) as { orderId: string };
    paypal.approve(created.orderId);
    await paypal.captureOrder(created.orderId);
    const captureId = (await paypal.getOrder(created.orderId)).purchase_units![0].payments!.captures![0].id;
    const body = captureCompletedEvent("WH-RETRY", created.orderId, captureId);

    const realGetOrder = paypal.getOrder.bind(paypal);
    paypal.getOrder = async () => { throw new Error("PayPal timeout"); };
    expect((await processPayPalWebhook(deps, body, signed())).status).toBe(500);
    paypal.getOrder = realGetOrder;
    expect((await processPayPalWebhook(deps, body, signed())).body.outcome).toBe("active");
    expect(entitlementKeys()).toHaveLength(1);
  });
});

describe("refund / revocation", () => {
  it("a verified refund revokes access", async () => {
    const { accountId, orderId, captureId } = await purchase();
    paypal.setCaptureStatus(captureId, "REFUNDED");
    const res = await processPayPalWebhook(deps, refundEvent("WH-REFUND", captureId), signed());
    expect(res.body.outcome).toBe("revoked");

    const ent = await getEntitlement(store, accountId, DISCOVERY_PREMIUM);
    expect(ent?.status).toBe("refunded");
    expect(isActive(ent)).toBe(false);
    expect((await getOrder(store, orderId))?.status).toBe("refunded");
    const txn = JSON.parse((await store.get(keys.transaction(captureId)))!) as TransactionRecord;
    expect(txn.status).toBe("refunded");
    expect(logs.map(l => l.event)).toContain("entitlement.revoked");
  });

  it("a refunded capture replayed as COMPLETED does not re-grant access", async () => {
    const { accountId, orderId, captureId } = await purchase();
    paypal.setCaptureStatus(captureId, "REFUNDED");
    await processPayPalWebhook(deps, refundEvent("WH-R1", captureId), signed());
    paypal.setCaptureStatus(captureId, "COMPLETED"); // attacker replays an old completion
    await processPayPalWebhook(deps, captureCompletedEvent("WH-OLD", orderId, captureId), signed());
    expect(isActive(await getEntitlement(store, accountId, DISCOVERY_PREMIUM))).toBe(false);
  });

  it("a refund webhook whose refund PayPal does not confirm changes nothing", async () => {
    const { accountId, captureId } = await purchase();
    const res = await processPayPalWebhook(deps, refundEvent("WH-R2", captureId), signed());
    expect(res.body.outcome).toBe("ignored");
    expect(isActive(await getEntitlement(store, accountId, DISCOVERY_PREMIUM))).toBe(true);
  });

  it("a partial refund is flagged for review and keeps access", async () => {
    const { accountId, captureId } = await purchase();
    paypal.setCaptureStatus(captureId, "PARTIALLY_REFUNDED");
    const res = await processPayPalWebhook(deps, refundEvent("WH-R3", captureId), signed());
    expect(res.body.outcome).toBe("partial_refund_review");
    expect(isActive(await getEntitlement(store, accountId, DISCOVERY_PREMIUM))).toBe(true);
  });

  it("an account can buy again after a refund and is re-activated", async () => {
    const first = await purchase();
    paypal.setCaptureStatus(first.captureId, "REFUNDED");
    await processPayPalWebhook(deps, refundEvent("WH-R4", first.captureId), signed());
    const again = await purchase(first.accountId);
    expect(again.state).toBe("active");
    const ent = await getEntitlement(store, first.accountId, DISCOVERY_PREMIUM);
    expect(ent?.transactionId).toBe(again.captureId);
  });
});

describe("logging hygiene", () => {
  it("never writes secrets or signatures to the log", async () => {
    process.env.PAYPAL_CLIENT_SECRET = "super-secret-value";
    const { log } = await import("@/server/log");
    log("info", "webhook.received", { authorization: "Bearer abc", transmission_sig: "sig", nested: { clientSecret: "x", accessKey: "GEI-1" } });
    const line = JSON.stringify(logs.at(-1));
    expect(line).not.toContain("Bearer abc");
    expect(line).not.toContain("\"sig\"");
    expect(line).not.toContain("GEI-1");
    expect(line).not.toContain("super-secret-value");
  });
});

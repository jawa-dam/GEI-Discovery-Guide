import "server-only";
import { randomBytes } from "node:crypto";
import { getActiveProduct } from "@/lib/catalog";
import { ConfigError } from "./config";
import {
  advanceOrder,
  getEntitlement,
  getOrder,
  grantEntitlement,
  isActive,
  isEventProcessed,
  markEventProcessed,
  recordPendingOrder,
  revokeForCapture,
  WrongProductError,
  type OrderRecord,
  type VerifiedCapture
} from "./entitlements";
import { errorMessage, log } from "./log";
import type { PayPalClient, PayPalOrder, PayPalWebhookEvent } from "./paypal";
import type { KeyValueStore } from "./store/types";

/*
 * Payment orchestration. Every path that can unlock the guide ends in
 * grantEntitlement() with a capture this module re-fetched from PayPal and
 * matched against the order WE created: our product id, our invoice id, the
 * catalog price and currency, and capture status COMPLETED. Nothing the
 * browser sends — success flags, amounts, order states — is trusted.
 */

export interface PaymentDeps {
  store: KeyValueStore;
  paypal: PayPalClient;
}

export type CheckoutState = "active" | "pending" | "failed" | "not_found";

/* ----------------------------------------------------------- order creation */

export async function createCheckoutOrder(deps: PaymentDeps, accountId: string, productId: string) {
  const product = getActiveProduct(productId);
  if (!product) {
    log("warn", "checkout.order_rejected", { reason: "UNKNOWN_PRODUCT", productId, accountId });
    return { ok: false as const, reason: "UNKNOWN_PRODUCT" };
  }

  const existing = await getEntitlement(deps.store, accountId, product.entitlement);
  if (isActive(existing)) return { ok: false as const, reason: "ALREADY_ACTIVE" };

  const nonce = randomBytes(12).toString("base64url");
  const invoiceId = "GEI-DISCOVERY-" + nonce;
  const order = await deps.paypal.createOrder({
    requestId: "gei-discovery-order-" + nonce,
    productId: product.productId,
    invoiceId,
    description: `${product.name} — ${product.edition}`,
    amount: { currency_code: product.currency, value: product.price }
  });

  const unit = order.purchase_units?.[0];
  if (
    !order.id ||
    unit?.custom_id !== product.productId ||
    unit?.invoice_id !== invoiceId ||
    unit?.amount?.currency_code !== product.currency ||
    unit?.amount?.value !== product.price
  ) {
    log("error", "checkout.order_rejected", { reason: "PAYPAL_ORDER_MISMATCH", accountId });
    return { ok: false as const, reason: "PAYPAL_ORDER_MISMATCH" };
  }

  await recordPendingOrder(deps.store, {
    orderId: order.id,
    accountId,
    productId: product.productId,
    entitlement: product.entitlement,
    amount: product.price,
    currency: product.currency,
    invoiceId
  });
  log("info", "checkout.order_created", { orderId: order.id, accountId, productId: product.productId });
  return { ok: true as const, orderId: order.id };
}

/* ------------------------------------------------------------- verification */

type Verification =
  | { kind: "paid"; capture: VerifiedCapture }
  | { kind: "pending" }
  | { kind: "failed" }
  | { kind: "unpaid" }
  | { kind: "mismatch"; reason: string };

/** Matches PayPal's authoritative order representation against the order we created. */
export function verifyPayPalOrder(order: PayPalOrder, record: OrderRecord, expectedCaptureId?: string): Verification {
  const product = getActiveProduct(record.productId);
  const unit = order.purchase_units?.[0];
  if (!product) return { kind: "mismatch", reason: "UNKNOWN_PRODUCT" };
  if (order.id !== record.orderId) return { kind: "mismatch", reason: "ORDER_ID" };
  if (unit?.custom_id !== product.productId) return { kind: "mismatch", reason: "PRODUCT_ID" };
  if (unit?.invoice_id !== record.invoiceId) return { kind: "mismatch", reason: "INVOICE_ID" };
  if (unit?.amount?.currency_code !== product.currency || unit?.amount?.value !== product.price) {
    return { kind: "mismatch", reason: "AMOUNT" };
  }

  const captures = unit.payments?.captures || [];
  const capture = expectedCaptureId ? captures.find(c => c.id === expectedCaptureId) : captures.find(c => c.status === "COMPLETED") || captures[0];
  if (!capture) return { kind: "unpaid" };
  if (capture.amount && (capture.amount.currency_code !== product.currency || capture.amount.value !== product.price)) {
    return { kind: "mismatch", reason: "CAPTURE_AMOUNT" };
  }
  if (capture.status === "PENDING") return { kind: "pending" };
  if (capture.status !== "COMPLETED") return { kind: "failed" };

  return {
    kind: "paid",
    capture: {
      captureId: capture.id,
      orderId: record.orderId,
      accountId: record.accountId,
      productId: product.productId,
      amount: product.price,
      currency: product.currency,
      payerId: order.payer?.payer_id || null
    }
  };
}

async function settle(
  deps: PaymentDeps,
  record: OrderRecord,
  verification: Verification,
  context: { via: "capture" | "webhook"; eventId?: string }
): Promise<CheckoutState> {
  switch (verification.kind) {
    case "paid": {
      log("info", "payment.verified", { via: context.via, orderId: record.orderId, captureId: verification.capture.captureId, accountId: record.accountId });
      const { entitlement } = await grantEntitlement(deps.store, verification.capture, context);
      return isActive(entitlement) ? "active" : "failed";
    }
    case "pending":
      log("info", "payment.pending", { via: context.via, orderId: record.orderId, accountId: record.accountId });
      await advanceOrder(deps.store, record.orderId, "pending");
      return "pending";
    case "unpaid":
      return "pending";
    case "failed":
      log("warn", "payment.failed", { via: context.via, orderId: record.orderId, accountId: record.accountId });
      await advanceOrder(deps.store, record.orderId, "failed");
      return "failed";
    case "mismatch":
      log("error", "payment.verification_failed", { via: context.via, orderId: record.orderId, reason: verification.reason });
      await advanceOrder(deps.store, record.orderId, "failed");
      return "failed";
  }
}

/**
 * Called by the browser after PayPal approval. The browser only supplies the
 * order id; the account comes from the signed session and must own the order.
 */
export async function captureCheckoutOrder(deps: PaymentDeps, accountId: string, orderId: string): Promise<CheckoutState> {
  const record = await getOrder(deps.store, orderId);
  if (!record || record.accountId !== accountId) {
    log("warn", "payment.verification_failed", { via: "capture", reason: "ORDER_NOT_OWNED", accountId });
    return "not_found";
  }
  return captureAndSettle(deps, record, { via: "capture" });
}

async function captureAndSettle(deps: PaymentDeps, record: OrderRecord, context: { via: "capture" | "webhook"; eventId?: string }) {
  if (isActive(await getEntitlement(deps.store, record.accountId, record.entitlement)) && record.status === "active") {
    return "active" as const;
  }
  log("info", "payment.verification_started", { via: context.via, orderId: record.orderId, accountId: record.accountId });

  let order = await deps.paypal.getOrder(record.orderId);
  if (order.status === "APPROVED") {
    // Capture may race between the browser and the APPROVED webhook; PayPal's
    // request id makes it idempotent, and we always re-read the order after.
    await deps.paypal.captureOrder(record.orderId);
    order = await deps.paypal.getOrder(record.orderId);
  }
  return settle(deps, record, verifyPayPalOrder(order, record), context);
}

/* ------------------------------------------------------------------ webhook */

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function captureIdFromRefund(event: PayPalWebhookEvent): string | null {
  const related = event.resource?.supplementary_data?.related_ids?.capture_id;
  if (related) return related;
  const up = event.resource?.links?.find(link => link.rel === "up" && /\/captures\//.test(link.href || ""));
  const match = up?.href?.match(/\/captures\/([A-Za-z0-9-]+)/);
  return match ? match[1] : null;
}

export async function processPayPalWebhook(deps: PaymentDeps, rawBody: string, headers: Headers): Promise<WebhookResult> {
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    log("warn", "webhook.signature_invalid", { reason: "MALFORMED_BODY" });
    return { status: 400, body: { error: "Invalid webhook." } };
  }

  let verified = false;
  try {
    verified = await deps.paypal.verifyWebhookSignature(headers, event);
  } catch (err) {
    if (err instanceof ConfigError) {
      log("error", "config.error", { area: "webhook", message: err.message });
      return { status: 503, body: { error: "Webhook not configured." } };
    }
    log("error", "webhook.error", { stage: "verify", message: errorMessage(err) });
    return { status: 500, body: { error: "Webhook verification unavailable." } };
  }

  const eventId = typeof event.id === "string" ? event.id : "";
  const eventType = typeof event.event_type === "string" ? event.event_type : "UNKNOWN";
  if (!verified || !eventId) {
    log("warn", "webhook.signature_invalid", { eventType, eventId: eventId || null });
    return { status: 400, body: { error: "Invalid webhook." } };
  }

  log("info", "webhook.received", { eventType, eventId });

  if (await isEventProcessed(deps.store, eventId)) {
    log("info", "webhook.duplicate", { eventType, eventId });
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    const outcome = await handleVerifiedEvent(deps, event, eventType, eventId);
    await markEventProcessed(deps.store, eventId, outcome);
    return { status: 200, body: { received: true, outcome } };
  } catch (err) {
    if (err instanceof WrongProductError) {
      await markEventProcessed(deps.store, eventId, "wrong_product");
      return { status: 200, body: { received: true, outcome: "wrong_product" } };
    }
    log("error", "webhook.error", { eventType, eventId, message: errorMessage(err) });
    // Non-2xx so PayPal retries; replays are safe because grants are idempotent.
    return { status: 500, body: { error: "Webhook processing failed." } };
  }
}

async function handleVerifiedEvent(deps: PaymentDeps, event: PayPalWebhookEvent, eventType: string, eventId: string): Promise<string> {
  const resource = event.resource || {};

  if (eventType === "CHECKOUT.ORDER.APPROVED" || eventType === "PAYMENT.CAPTURE.COMPLETED" ||
      eventType === "PAYMENT.CAPTURE.PENDING" || eventType === "PAYMENT.CAPTURE.DENIED" ||
      eventType === "PAYMENT.CAPTURE.DECLINED") {
    const orderId = eventType === "CHECKOUT.ORDER.APPROVED" ? resource.id : resource.supplementary_data?.related_ids?.order_id;
    const record = orderId ? await getOrder(deps.store, orderId) : null;
    if (!record) {
      // Not a Discovery Guide order (e.g. a GEI game purchase on the same PayPal app).
      log("info", "webhook.ignored", { eventType, eventId, reason: "UNKNOWN_ORDER" });
      return "ignored";
    }
    if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "PAYMENT.CAPTURE.DECLINED") {
      log("warn", "payment.failed", { via: "webhook", eventId, orderId: record.orderId, accountId: record.accountId });
      await advanceOrder(deps.store, record.orderId, "failed");
      return "failed";
    }
    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      return captureAndSettle(deps, record, { via: "webhook", eventId });
    }
    const order = await deps.paypal.getOrder(record.orderId);
    return settle(deps, record, verifyPayPalOrder(order, record, resource.id), { via: "webhook", eventId });
  }

  if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
    const captureId = eventType === "PAYMENT.CAPTURE.REVERSED" ? captureIdFromRefund(event) || resource.id : captureIdFromRefund(event);
    if (!captureId) {
      log("warn", "entitlement.unexpected_state", { reason: "REFUND_WITHOUT_CAPTURE", eventId, eventType });
      return "ignored";
    }
    const capture = await deps.paypal.getCapture(captureId);
    if (capture.status === "PARTIALLY_REFUNDED") {
      log("warn", "entitlement.unexpected_state", { reason: "PARTIAL_REFUND_REVIEW", eventId, captureId });
      return "partial_refund_review";
    }
    if (capture.status !== "REFUNDED" && capture.status !== "REVERSED") {
      log("warn", "entitlement.unexpected_state", { reason: "REFUND_NOT_CONFIRMED", eventId, captureId, captureStatus: capture.status });
      return "ignored";
    }
    const result = await revokeForCapture(deps.store, captureId, capture.status === "REFUNDED" ? "refunded" : "revoked", eventType);
    if (!result.known) {
      log("info", "webhook.ignored", { eventType, eventId, reason: "UNKNOWN_CAPTURE" });
      return "ignored";
    }
    return result.revoked ? "revoked" : "already_inactive";
  }

  log("info", "webhook.ignored", { eventType, eventId, reason: "UNHANDLED_EVENT_TYPE" });
  return "ignored";
}

import { paymentDeps } from "@/server/deps";
import { currentAccountId, json, sameOrigin } from "@/server/http";
import { errorMessage, log } from "@/server/log";
import { captureCheckoutOrder } from "@/server/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Called after the customer approves in PayPal. Only the order id is read
 * from the browser; the result reports the state the SERVER verified. The
 * browser then navigates to /purchase/success, which re-checks on its own.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const body = (await request.json().catch(() => ({}))) as { orderId?: unknown };
  const orderId = typeof body.orderId === "string" && /^[A-Za-z0-9-]{6,64}$/.test(body.orderId) ? body.orderId : null;
  if (!orderId) return json({ state: "not_found" }, 400);

  const accountId = await currentAccountId();
  if (!accountId) return json({ state: "not_found" }, 401);

  try {
    const state = await captureCheckoutOrder(paymentDeps(), accountId, orderId);
    return json({ state }, state === "not_found" ? 404 : 200);
  } catch (err) {
    log("error", "payment.verification_failed", { via: "capture", orderId, message: errorMessage(err) });
    // Unknown outcome: the webhook will settle it. Never report success here.
    return json({ state: "pending" }, 202);
  }
}

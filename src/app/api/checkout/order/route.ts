import { DISCOVERY_PRODUCT_ID } from "@/lib/catalog";
import { checkoutConfigured } from "@/server/config";
import { paymentDeps } from "@/server/deps";
import { currentOrNewAccountId, json, sameOrigin } from "@/server/http";
import { errorMessage, log } from "@/server/log";
import { createCheckoutOrder } from "@/server/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!checkoutConfigured()) return json({ error: "Checkout is temporarily unavailable." }, 503);

  const body = (await request.json().catch(() => ({}))) as { productId?: unknown };
  const productId = typeof body.productId === "string" ? body.productId : DISCOVERY_PRODUCT_ID;

  try {
    const accountId = await currentOrNewAccountId();
    const result = await createCheckoutOrder(paymentDeps(), accountId, productId);
    if (!result.ok) {
      if (result.reason === "ALREADY_ACTIVE") return json({ state: "active" }, 409);
      return json({ error: "This product is not available." }, 400);
    }
    return json({ orderId: result.orderId });
  } catch (err) {
    log("error", "checkout.order_rejected", { reason: "EXCEPTION", message: errorMessage(err) });
    return json({ error: "Checkout is temporarily unavailable." }, 502);
  }
}

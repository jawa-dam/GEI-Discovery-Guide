import type { PayPalCapture, PayPalClient, PayPalOrder } from "@/server/paypal";

/*
 * In-memory PayPal used by the tests. It behaves like Orders v2 for the
 * paths the ledger uses: create → (buyer approves) → capture → COMPLETED,
 * plus pending/denied captures, refunds, and webhook signature checks
 * (a webhook is "signed" when it carries the header x-test-signature: valid).
 */
export class FakePayPal implements PayPalClient {
  orders = new Map<string, PayPalOrder>();
  captures = new Map<string, PayPalCapture & { orderId: string }>();
  nextCaptureStatus: "COMPLETED" | "PENDING" | "DECLINED" = "COMPLETED";
  private seq = 0;

  async createOrder(input: Parameters<PayPalClient["createOrder"]>[0]): Promise<PayPalOrder> {
    const id = "ORDER" + String(++this.seq).padStart(6, "0");
    const order: PayPalOrder = {
      id,
      status: "CREATED",
      purchase_units: [{ custom_id: input.productId, invoice_id: input.invoiceId, amount: { ...input.amount }, payments: { captures: [] } }]
    };
    this.orders.set(id, order);
    return structuredClone(order);
  }

  /** Simulates the buyer approving the order in the PayPal popup. */
  approve(orderId: string, payerId = "PAYER123") {
    const order = this.orders.get(orderId)!;
    order.status = "APPROVED";
    order.payer = { payer_id: payerId };
  }

  /** Simulates a tampered/foreign order on PayPal's side. */
  mutate(orderId: string, fn: (order: PayPalOrder) => void) {
    fn(this.orders.get(orderId)!);
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("not found");
    return structuredClone(order);
  }

  async captureOrder(orderId: string): Promise<PayPalOrder | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "APPROVED") return null;
    const unit = order.purchase_units![0];
    const captureId = "CAPTURE" + String(++this.seq).padStart(6, "0");
    const capture = { id: captureId, status: this.nextCaptureStatus, amount: { ...unit.amount! } };
    unit.payments = { captures: [capture] };
    order.status = this.nextCaptureStatus === "COMPLETED" ? "COMPLETED" : this.nextCaptureStatus === "PENDING" ? "COMPLETED" : "APPROVED";
    this.captures.set(captureId, { ...capture, orderId });
    return structuredClone(order);
  }

  async getCapture(captureId: string): Promise<PayPalCapture> {
    const capture = this.captures.get(captureId);
    if (!capture) throw new Error("not found");
    return { id: capture.id, status: capture.status, amount: capture.amount };
  }

  setCaptureStatus(captureId: string, status: string) {
    const capture = this.captures.get(captureId)!;
    capture.status = status;
    const order = this.orders.get(capture.orderId)!;
    const inOrder = order.purchase_units![0].payments!.captures!.find(c => c.id === captureId)!;
    inOrder.status = status;
  }

  async verifyWebhookSignature(headers: Headers): Promise<boolean> {
    return headers.get("x-test-signature") === "valid";
  }
}

export const signed = () => new Headers({ "x-test-signature": "valid" });
export const unsigned = () => new Headers({ "x-test-signature": "forged" });

export function captureCompletedEvent(eventId: string, orderId: string, captureId: string) {
  return JSON.stringify({
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: captureId, status: "COMPLETED", supplementary_data: { related_ids: { order_id: orderId } } }
  });
}

export function refundEvent(eventId: string, captureId: string) {
  return JSON.stringify({
    id: eventId,
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    resource: {
      id: "REFUND-" + captureId,
      status: "COMPLETED",
      links: [{ rel: "up", href: "https://api-m.paypal.com/v2/payments/captures/" + captureId }]
    }
  });
}

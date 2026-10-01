import "server-only";
import { paypalApiBase, paypalCredentials, paypalWebhookId } from "./config";

/*
 * Thin PayPal REST client (Orders v2 + webhook signature verification).
 * Mirrors the calls used by the existing GEI checkout in gei-mountain-ocean.
 * Returned shapes are narrowed to the fields the ledger needs.
 */

export interface PayPalAmount {
  currency_code: string;
  value: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  payer?: { payer_id?: string };
  purchase_units?: Array<{
    custom_id?: string;
    invoice_id?: string;
    amount?: PayPalAmount;
    payments?: { captures?: PayPalCapture[] };
  }>;
}

export interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    invoice_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    links?: Array<{ href?: string; rel?: string }>;
  };
}

export interface PayPalClient {
  createOrder(input: {
    requestId: string;
    productId: string;
    invoiceId: string;
    description: string;
    amount: PayPalAmount;
  }): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  /** Captures an approved order. Returns the order representation, or null if PayPal refused. */
  captureOrder(orderId: string): Promise<PayPalOrder | null>;
  getCapture(captureId: string): Promise<PayPalCapture>;
  verifyWebhookSignature(headers: Headers, event: unknown): Promise<boolean>;
}

class PayPalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PayPalApiError";
  }
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const { clientId, clientSecret } = paypalCredentials();
  const response = await fetch(paypalApiBase() + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) throw new PayPalApiError(response.status, "PayPal authentication failed.");
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 300) * 1000 };
  return data.access_token;
}

async function api<T>(path: string, init: RequestInit & { allowError?: boolean } = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const token = await accessToken();
  const response = await fetch(paypalApiBase() + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store"
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok && !init.allowError) throw new PayPalApiError(response.status, "PayPal request failed: " + path.split("?")[0]);
  return { ok: response.ok, status: response.status, data };
}

export const paypal: PayPalClient = {
  async createOrder({ requestId, productId, invoiceId, description, amount }) {
    const { data } = await api<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId, Prefer: "return=representation" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ custom_id: productId, invoice_id: invoiceId, description, amount }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "GEI Discovery Guide",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING"
            }
          }
        }
      })
    });
    return data;
  },

  async getOrder(orderId) {
    const { data } = await api<PayPalOrder>("/v2/checkout/orders/" + encodeURIComponent(orderId));
    return data;
  },

  async captureOrder(orderId) {
    const result = await api<PayPalOrder>("/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture", {
      method: "POST",
      headers: { "PayPal-Request-Id": "gei-discovery-capture-" + orderId, Prefer: "return=representation" },
      body: "{}",
      allowError: true
    });
    return result.ok ? result.data : null;
  },

  async getCapture(captureId) {
    const { data } = await api<PayPalCapture>("/v2/payments/captures/" + encodeURIComponent(captureId));
    return data;
  },

  async verifyWebhookSignature(headers, event) {
    const { ok, data } = await api<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      allowError: true,
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo") || "",
        cert_url: headers.get("paypal-cert-url") || "",
        transmission_id: headers.get("paypal-transmission-id") || "",
        transmission_sig: headers.get("paypal-transmission-sig") || "",
        transmission_time: headers.get("paypal-transmission-time") || "",
        webhook_id: paypalWebhookId(),
        webhook_event: event
      })
    });
    return ok && data.verification_status === "SUCCESS";
  }
};

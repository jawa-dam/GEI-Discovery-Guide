import "server-only";

/*
 * Server configuration. Every secret is read from the environment at call
 * time and never leaves the server. Missing configuration fails closed:
 * no checkout, no webhook processing, no access.
 */

export type PayPalEnv = "live" | "sandbox";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function isVercel(): boolean {
  return !!process.env.VERCEL;
}

export function paypalEnv(): PayPalEnv {
  const value = (process.env.PAYPAL_ENV || "live").toLowerCase();
  if (value !== "live" && value !== "sandbox") throw new ConfigError("PAYPAL_ENV must be live or sandbox.");
  return value;
}

export function paypalApiBase(): string {
  return paypalEnv() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID || null;
}

export function paypalCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ConfigError("PayPal credentials are not configured.");
  return { clientId, clientSecret };
}

export function paypalWebhookId(): string {
  const id = process.env.PAYPAL_WEBHOOK_ID;
  if (!id) throw new ConfigError("PayPal webhook is not configured.");
  return id;
}

export function checkoutConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/** HMAC key for account session cookies. */
export function sessionSecret(): string {
  const secret = process.env.ENTITLEMENT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new ConfigError("ENTITLEMENT_SESSION_SECRET must be set (32+ characters).");
  }
  return secret;
}

export type StoreDriver = "redis" | "file" | "memory";

export function storeDriver(): StoreDriver {
  const explicit = (process.env.ENTITLEMENT_STORE || "").toLowerCase();
  if (explicit === "memory" || explicit === "file" || explicit === "redis") {
    // Non-durable drivers are for local development and automated tests only.
    if (explicit !== "redis" && isVercel()) {
      throw new ConfigError("Non-durable entitlement storage is not allowed on Vercel.");
    }
    return explicit;
  }
  if (explicit) throw new ConfigError("ENTITLEMENT_STORE must be redis, file or memory.");
  return "redis";
}

export function redisConfig(): { url: string; token: string } {
  // Same variable names as the existing GEI PayPal ledger (gei-mountain-ocean),
  // so both projects can share one Upstash / Vercel KV database.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new ConfigError("Durable entitlement storage is not configured.");
  return { url: url.replace(/\/$/, ""), token };
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

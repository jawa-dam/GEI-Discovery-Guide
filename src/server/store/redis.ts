import type { KeyValueStore } from "./types";

type Fetch = typeof fetch;

/*
 * Upstash Redis REST store — the same durable storage the existing GEI
 * PayPal ledger uses. Keys are namespaced under `gei:discovery:` (see
 * entitlements.ts) so the two projects can share one database safely.
 */
export class UpstashRedisStore implements KeyValueStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  private async command(command: (string | number)[]): Promise<unknown> {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { Authorization: "Bearer " + this.token, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store"
    });
    const data = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!response.ok || data.error) throw new Error("Entitlement storage request failed.");
    return data.result;
  }

  async get(key: string) {
    const result = await this.command(["GET", key]);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    await this.command(ttlSeconds ? ["SET", key, value, "EX", ttlSeconds] : ["SET", key, value]);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds?: number) {
    const result = await this.command(
      ttlSeconds ? ["SET", key, value, "NX", "EX", ttlSeconds] : ["SET", key, value, "NX"]
    );
    return result === "OK";
  }
}

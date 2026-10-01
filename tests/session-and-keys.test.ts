import { describe, expect, it } from "vitest";
import { issueAccessKey, normalizeAccessKey, resolveAccessKey } from "@/server/access-keys";
import { decodeSession, encodeSession, newAccountId, SESSION_MAX_AGE_SECONDS } from "@/server/session";
import { MemoryStore } from "@/server/store/memory";
import { UpstashRedisStore } from "@/server/store/redis";

const SECRET = "test-secret-test-secret-test-secret-42";

describe("account session cookie", () => {
  it("round-trips a signed account id", () => {
    const id = newAccountId();
    expect(decodeSession(encodeSession(id, SECRET), SECRET)).toBe(id);
  });

  it("rejects tampering, forgery, wrong secret and expiry", () => {
    const id = newAccountId();
    const cookie = encodeSession(id, SECRET);
    const [body, mac] = cookie.split(".");
    const otherBody = Buffer.from(JSON.stringify({ v: 1, aid: newAccountId(), iat: 0, exp: 9999999999 })).toString("base64url");

    expect(decodeSession(otherBody + "." + mac, SECRET)).toBeNull();
    expect(decodeSession(body + "." + mac.slice(0, -2) + "AA", SECRET)).toBeNull();
    expect(decodeSession(cookie, SECRET + "x")).toBeNull();
    expect(decodeSession("premium=true", SECRET)).toBeNull();
    expect(decodeSession("", SECRET)).toBeNull();
    expect(decodeSession(cookie, SECRET, Date.now() + (SESSION_MAX_AGE_SECONDS + 5) * 1000)).toBeNull();
  });
});

describe("access keys", () => {
  it("issues a key that restores the account, and rotation retires the old key", async () => {
    const store = new MemoryStore();
    const accountId = newAccountId();
    const first = await issueAccessKey(store, accountId);
    expect(first).toMatch(/^GEI(-[A-Z2-9]{5}){5}$/);
    expect(await resolveAccessKey(store, first)).toBe(accountId);
    expect(await resolveAccessKey(store, first.toLowerCase().replace(/-/g, " "))).toBe(accountId);

    const second = await issueAccessKey(store, accountId);
    expect(await resolveAccessKey(store, first)).toBeNull();
    expect(await resolveAccessKey(store, second)).toBe(accountId);
    expect([...store.data.values()].join("")).not.toContain(second);
  });

  it("rejects malformed and unknown keys", async () => {
    const store = new MemoryStore();
    expect(normalizeAccessKey("nope")).toBeNull();
    expect(await resolveAccessKey(store, "GEI-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA")).toBeNull();
    expect(await resolveAccessKey(store, { key: 1 })).toBeNull();
  });
});

describe("Upstash Redis driver", () => {
  it("speaks the Upstash REST protocol and uses SET NX for idempotency", async () => {
    const data = new Map<string, string>();
    const calls: unknown[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(init.body as string) as string[];
      calls.push(cmd);
      let result: unknown = null;
      if (cmd[0] === "GET") result = data.get(cmd[1]) ?? null;
      if (cmd[0] === "SET") {
        if (cmd.includes("NX") && data.has(cmd[1])) result = null;
        else {
          data.set(cmd[1], cmd[2]);
          result = "OK";
        }
      }
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;

    const store = new UpstashRedisStore("https://example.upstash.io", "token", fakeFetch);
    expect(await store.setIfAbsent("k", "v1")).toBe(true);
    expect(await store.setIfAbsent("k", "v2")).toBe(false);
    expect(await store.get("k")).toBe("v1");
    await store.set("e", "x", 60);
    expect(calls).toContainEqual(["SET", "k", "v1", "NX"]);
    expect(calls).toContainEqual(["SET", "e", "x", "EX", 60]);
  });
});

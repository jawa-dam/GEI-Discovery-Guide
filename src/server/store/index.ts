import "server-only";
import path from "node:path";
import { redisConfig, storeDriver } from "../config";
import { FileStore } from "./file";
import { MemoryStore } from "./memory";
import { UpstashRedisStore } from "./redis";
import type { KeyValueStore } from "./types";

let cached: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
  if (cached) return cached;
  const driver = storeDriver();
  if (driver === "memory") cached = new MemoryStore();
  else if (driver === "file") cached = new FileStore(process.env.ENTITLEMENT_STORE_FILE || path.join(process.cwd(), ".data", "store.json"));
  else {
    const { url, token } = redisConfig();
    cached = new UpstashRedisStore(url, token);
  }
  return cached;
}

export type { KeyValueStore };

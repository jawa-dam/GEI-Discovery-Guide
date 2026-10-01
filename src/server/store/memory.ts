import type { KeyValueStore } from "./types";

/** In-process store for tests. Not durable; refused on Vercel by config.storeDriver(). */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();

  async get(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  async set(key: string, value: string) {
    this.data.set(key, value);
  }

  async setIfAbsent(key: string, value: string) {
    if (this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }
}

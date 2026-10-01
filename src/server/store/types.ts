/*
 * Minimal key/value contract the entitlement ledger is built on.
 * `setIfAbsent` is the atomic primitive that makes grants idempotent:
 * exactly one writer can create a given transaction record.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Atomically set only if the key does not exist. Returns true if this call created it. */
  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
}

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { KeyValueStore } from "./types";

/*
 * JSON-file store for local development and the end-to-end access test
 * (scripts/e2e-access.mjs), so a real `next start` server can be exercised
 * without cloud credentials. Not durable; refused on Vercel.
 */
export class FileStore implements KeyValueStore {
  constructor(private readonly file: string) {}

  private read(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      return {};
    }
  }

  private write(data: Record<string, string>) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }

  async get(key: string) {
    const data = this.read();
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
  }

  async set(key: string, value: string) {
    const data = this.read();
    data[key] = value;
    this.write(data);
  }

  async setIfAbsent(key: string, value: string) {
    const data = this.read();
    if (Object.prototype.hasOwnProperty.call(data, key)) return false;
    data[key] = value;
    this.write(data);
    return true;
  }
}

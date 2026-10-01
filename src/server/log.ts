import "server-only";

/*
 * Structured, redacting server log. One JSON line per event so Vercel log
 * search can filter on `event`, `accountId`, `captureId`, etc.
 *
 * Never pass secrets in. As a second line of defence, any field whose name
 * looks sensitive is replaced before it is written.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogEvent =
  | "checkout.order_created"
  | "checkout.order_rejected"
  | "payment.verification_started"
  | "payment.verified"
  | "payment.verification_failed"
  | "payment.pending"
  | "payment.failed"
  | "webhook.received"
  | "webhook.signature_invalid"
  | "webhook.duplicate"
  | "webhook.ignored"
  | "webhook.error"
  | "entitlement.created"
  | "entitlement.duplicate"
  | "entitlement.repaired"
  | "entitlement.revoked"
  | "entitlement.unexpected_state"
  | "entitlement.wrong_product"
  | "access.granted"
  | "access.denied"
  | "access.restored"
  | "access.restore_failed"
  | "access.key_issued"
  | "config.error";

const SENSITIVE = /secret|token|password|authorization|cookie|signature|transmission_sig|cert|email|card|key$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Sink = (line: string, level: LogLevel) => void;

let sink: Sink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/** Tests replace the sink to assert on audit events. */
export function setLogSink(next: Sink): void {
  sink = next;
}

export function log(level: LogLevel, event: LogEvent, fields: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    app: "gei-discovery-guide",
    event,
    ...(redact(fields) as Record<string, unknown>)
  };
  sink(JSON.stringify(entry), level);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

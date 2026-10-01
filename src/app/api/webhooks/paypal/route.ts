import { paymentDeps } from "@/server/deps";
import { json } from "@/server/http";
import { processPayPalWebhook } from "@/server/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 256 * 1024) return json({ error: "Payload too large." }, 413);
  const result = await processPayPalWebhook(paymentDeps(), raw, request.headers);
  return json(result.body, result.status);
}

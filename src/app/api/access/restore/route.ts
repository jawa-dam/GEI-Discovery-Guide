import { resolveAccessKey } from "@/server/access-keys";
import { json, sameOrigin, setSessionAccount } from "@/server/http";
import { log } from "@/server/log";
import { getStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const body = (await request.json().catch(() => ({}))) as { accessKey?: unknown };
  const accountId = await resolveAccessKey(getStore(), body.accessKey);
  if (!accountId) {
    log("warn", "access.restore_failed", {});
    return json({ restored: false }, 400);
  }
  await setSessionAccount(accountId);
  log("info", "access.restored", { accountId });
  return json({ restored: true });
}

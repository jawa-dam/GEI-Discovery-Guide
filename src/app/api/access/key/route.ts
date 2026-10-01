import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { issueAccessKey } from "@/server/access-keys";
import { getAccess } from "@/server/authz";
import { json, sameOrigin } from "@/server/http";
import { log } from "@/server/log";
import { getStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issues (or rotates) the account's access key. Only for accounts with active access. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const access = await getAccess(DISCOVERY_PREMIUM);
  if (access.state !== "granted") return json({ error: "Not available." }, 403);
  const key = await issueAccessKey(getStore(), access.accountId);
  log("info", "access.key_issued", { accountId: access.accountId });
  return json({ accessKey: key });
}

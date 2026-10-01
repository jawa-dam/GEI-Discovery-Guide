import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { getAccess } from "@/server/authz";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAccess(DISCOVERY_PREMIUM);
  return json({ access: access.state === "granted" ? "granted" : access.state === "unavailable" ? "unavailable" : "denied" });
}

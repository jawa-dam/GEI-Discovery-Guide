import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { getAccess } from "@/server/authz";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The current session's entitlement status — no payment data is ever returned. */
export async function GET() {
  const access = await getAccess(DISCOVERY_PREMIUM);
  if (access.state === "unavailable") return json({ entitlement: DISCOVERY_PREMIUM, status: "unavailable" }, 503);
  if (access.state === "granted") {
    return json({
      entitlement: DISCOVERY_PREMIUM,
      status: "active",
      productId: access.entitlement.productId,
      grantedAt: access.entitlement.grantedAt
    });
  }
  return json({ entitlement: DISCOVERY_PREMIUM, status: "none" });
}

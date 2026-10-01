import { SiteHeader } from "@/components/Brand";
import { GuideNav } from "@/components/GuideNav";
import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { requireEntitlement } from "@/server/authz";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/*
 * Guide shell. The layout checks too (so the chrome itself is never sent to
 * visitors), but layouts don't re-run on client navigation, so each page
 * also enforces access through the premium data-access layer.
 */
export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  await requireEntitlement(DISCOVERY_PREMIUM, "/guide (layout)");
  return (
    <>
      <SiteHeader cta={false} />
      <GuideNav />
      <main id="main">{children}</main>
    </>
  );
}

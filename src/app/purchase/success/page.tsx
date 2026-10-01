import type { Metadata } from "next";
import Link from "next/link";
import { AccessKeyCard } from "@/components/AccessKeyCard";
import { SiteHeader } from "@/components/Brand";
import { FlowGlyph, LockGlyph } from "@/components/LockGlyph";
import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { getAccess } from "@/server/authz";
import { getAccount, getOrder } from "@/server/entitlements";
import { getStore } from "@/server/store";

export const metadata: Metadata = { title: "Access", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * Landing point after checkout. Query parameters are ignored entirely:
 * ?success=true (or anything else) cannot change what this page shows.
 * The state comes from the entitlement store and the account's own order.
 */
type View = "granted" | "pending" | "failed" | "unverified";

async function resolveView(): Promise<View> {
  const access = await getAccess(DISCOVERY_PREMIUM);
  if (access.state === "granted") return "granted";
  if (!access.accountId || access.state === "unavailable") return "unverified";
  try {
    const store = getStore();
    const account = await getAccount(store, access.accountId);
    const order = account?.lastOrderId ? await getOrder(store, account.lastOrderId) : null;
    if (!order || order.accountId !== access.accountId) return "unverified";
    if (order.status === "pending" || order.status === "paid") return "pending";
    if (order.status === "failed") return "failed";
  } catch {
    // fall through
  }
  return "unverified";
}

export default async function PurchaseResultPage() {
  const view = await resolveView();

  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="state-screen">
        <div className="wrap" style={{ display: "grid", justifyItems: "center", gap: 20 }}>
          {view === "granted" ? (
            <>
              <div className="panel ticks state-card granted">
                <FlowGlyph />
                <p className="eyebrow reveal">💧 Flow authorized</p>
                <h1 className="state-title reveal reveal-2">Access granted</h1>
                <p className="mono reveal reveal-2" style={{ marginTop: 18, color: "var(--text)" }}>GEI Discovery Guide</p>
                <p className="mono reveal reveal-3" style={{ margin: "4px 0 0", color: "var(--pink)" }}>Premium access activated</p>
                <div className="btn-row reveal reveal-3">
                  <Link href="/guide" className="btn btn-primary">Enter the DAM Guide →</Link>
                </div>
              </div>
              <div style={{ width: "100%", maxWidth: 620 }}>
                <AccessKeyCard />
              </div>
            </>
          ) : view === "pending" ? (
            <div className="panel ticks state-card">
              <FlowGlyph />
              <p className="eyebrow">Verification in progress</p>
              <h1 className="state-title">Payment pending</h1>
              <p className="lead dim" style={{ marginTop: 18 }}>Your payment is still being verified. Please return shortly.</p>
              <div className="btn-row">
                <Link href="/purchase/success" className="btn btn-primary" prefetch={false}>Check access again</Link>
              </div>
            </div>
          ) : view === "failed" ? (
            <div className="panel ticks state-card">
              <LockGlyph />
              <p className="eyebrow">Checkout</p>
              <h1 className="state-title">Payment failed</h1>
              <p className="lead dim" style={{ marginTop: 18 }}>The purchase was not completed.</p>
              <div className="btn-row">
                <Link href="/purchase" className="btn btn-unlock">Try again</Link>
                <Link href="/preview" className="btn btn-ghost">Return to preview</Link>
              </div>
            </div>
          ) : (
            <div className="panel ticks state-card">
              <LockGlyph />
              <p className="eyebrow">Access check</p>
              <h1 className="state-title">Payment not verified</h1>
              <p className="lead dim" style={{ marginTop: 18 }}>We couldn&apos;t verify access yet.</p>
              <div className="btn-row">
                <Link href="/purchase/success" className="btn btn-primary" prefetch={false}>Check access again</Link>
                <Link href="/purchase" className="btn btn-ghost">Go to checkout</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Brand";
import { PayPalCheckout } from "@/components/PayPalCheckout";
import { DISCOVERY_PREMIUM, DISCOVERY_PRODUCT_ID, PRODUCTS } from "@/lib/catalog";
import { getAccess } from "@/server/authz";
import { checkoutConfigured, paypalClientId } from "@/server/config";

export const metadata: Metadata = { title: "Unlock the DAM Guide" };
export const dynamic = "force-dynamic";

export default async function PurchasePage() {
  const product = PRODUCTS[DISCOVERY_PRODUCT_ID];
  const access = await getAccess(DISCOVERY_PREMIUM);
  const clientId = paypalClientId();

  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="section">
        <div className="wrap">
          <div className="grid grid-2" style={{ alignItems: "start", gap: 24 }}>
            <div className="stack">
              <p className="eyebrow">Unlock</p>
              <h1 className="h2">{product.name}</h1>
              <p className="hero-sub" style={{ margin: "12px 0 0" }}>{product.edition}</p>
              <div className="price" style={{ marginTop: 24 }}>
                <strong>$50</strong>
                <span className="mono dim">USD · one-time</span>
              </div>
              <ul className="checklist" style={{ marginTop: 24 }}>
                <li>Account-level premium access to the DAM Guide</li>
                <li>The GEI Discovery Roadmap — eight gates and a final certification</li>
                <li>Every room as it opens in upcoming guide builds</li>
                <li>Built for your phone — buy and learn from anywhere</li>
              </ul>
            </div>

            <div className="panel ticks stack">
              {access.state === "granted" ? (
                <>
                  <span className="tag"><span className="dot" /> Access active</span>
                  <h2 className="h3">You already hold the DAM Guide.</h2>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <Link href="/guide" className="btn btn-primary">Enter the DAM Guide →</Link>
                  </div>
                </>
              ) : checkoutConfigured() && clientId ? (
                <>
                  <span className="tag tag-magenta"><span className="dot" /> Secure checkout</span>
                  <h2 className="h3">Pay with PayPal</h2>
                  <p className="dim" style={{ margin: 0 }}>
                    Your payment is verified directly with PayPal on our servers before access opens.
                  </p>
                  <PayPalCheckout clientId={clientId} productId={product.productId} />
                </>
              ) : (
                <>
                  <span className="tag tag-magenta">Checkout</span>
                  <h2 className="h3">Checkout is opening soon.</h2>
                  <p className="dim" style={{ margin: 0 }}>Purchases are temporarily unavailable. Please check back shortly.</p>
                </>
              )}
              <p className="faint" style={{ margin: "8px 0 0", fontSize: 16 }}>
                Bought it on another device? <Link href="/restore">Restore access</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

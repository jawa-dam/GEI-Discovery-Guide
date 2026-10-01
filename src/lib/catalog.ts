/*
 * GEI product + entitlement catalog.
 *
 * Payment is the transaction. Entitlement is the permission.
 * The guide is the experience.
 *
 * A product is something a customer pays for. An entitlement is the
 * account-level permission a verified payment for that product grants.
 * Adding a future GEI product means adding one entry to PRODUCTS (and,
 * if new, its entitlement to ENTITLEMENT_IDS) — authentication, the
 * ledger, the webhook and the authorization authority do not change.
 *
 * This module holds only public catalog facts (names, prices). It is safe
 * to import from client components. It grants nothing on its own: access
 * is decided exclusively by src/server/authz.ts against the server-side
 * entitlement store.
 */

/** Every GEI entitlement the platform knows about. Only GEI_DISCOVERY_PREMIUM is sellable in V1.0. */
export const ENTITLEMENT_IDS = [
  "GEI_DISCOVERY_BASIC",
  "GEI_DISCOVERY_PREMIUM",
  "GEI_MASTER",
  "GEI_PREMIUM"
] as const;

export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

export interface Product {
  productId: string;
  entitlement: EntitlementId;
  name: string;
  edition: string;
  /** Exact PayPal amount string. Compared verbatim against PayPal's order amount. */
  price: string;
  currency: "USD";
  /** Only active products can be ordered or granted. */
  active: boolean;
}

export const DISCOVERY_PREMIUM: EntitlementId = "GEI_DISCOVERY_PREMIUM";
export const DISCOVERY_PRODUCT_ID = "GEI-DISCOVERY-50";

export const PRODUCTS: Readonly<Record<string, Readonly<Product>>> = Object.freeze({
  [DISCOVERY_PRODUCT_ID]: Object.freeze({
    productId: DISCOVERY_PRODUCT_ID,
    entitlement: DISCOVERY_PREMIUM,
    name: "GEI Discovery Guide",
    edition: "The DAM Guide — Premium Investigation Experience",
    price: "50.00",
    currency: "USD",
    active: true
  })
  // Future products (not built in V1.0):
  //   "GEI-DISCOVERY-10" → GEI_DISCOVERY_BASIC
  //   "GEI-MASTER-69"    → GEI_MASTER
  //   "GEI-PREMIUM-99"   → GEI_PREMIUM
});

export function getActiveProduct(productId: unknown): Readonly<Product> | null {
  if (typeof productId !== "string") return null;
  const product = Object.prototype.hasOwnProperty.call(PRODUCTS, productId) ? PRODUCTS[productId] : null;
  return product && product.active ? product : null;
}

export function isEntitlementId(value: unknown): value is EntitlementId {
  return typeof value === "string" && (ENTITLEMENT_IDS as readonly string[]).includes(value);
}

export const DISCOVERY_PRICE_LABEL = "$50";

# GEI Discovery Guide

**THE DAM GUIDE — PREMIUM INVESTIGATION EXPERIENCE**

> You are not here to be told what to see. You are here to learn how to see.
>
> Genesis is the text. Observation is the instrument. Engineering is the comparison. You are the investigator.

This is the premium web app for the $50 GEI Discovery Guide. It is a separate product from the GEI game (`gei-mountain-ocean`) and the GEI Academy site (`yalltoo`).

**V1.0 is the secure foundation, not the guide content.** It contains:

- the payment → entitlement → access pipeline,
- one authorization authority for every protected route,
- the premium shell: landing, preview, purchase, the access states, and the protected dashboard with the eight-gate roadmap.

Gate content comes in the next guide build. Every gate is marked `COMING IN GUIDE BUILD`.

| | |
|---|---|
| Product ID | `GEI-DISCOVERY-50` |
| Entitlement | `GEI_DISCOVERY_PREMIUM` |
| Price | `$50.00 USD`, one time |
| Stack | Next.js 16 (App Router) · React 19 · TypeScript · Node.js runtime · Vercel |
| Payments | PayPal Orders v2 + verified webhooks (the same PayPal app as the GEI game) |
| Entitlement store | Upstash Redis / Vercel KV (the same store type as the GEI game ledger, under its own `gei:discovery:` namespace) |

---

## PRODUCT ACCESS MODEL

**The server decides payment verification and access. Nothing the browser says counts.**

```
Payment is the transaction.  →  PayPal capture, verified server-side
Entitlement is the permission. →  account-level record in the entitlement store
The guide is the experience.   →  rendered only after the server checks that record
```

1. **Account.** Starting checkout creates an anonymous account. The browser holds an `httpOnly` cookie signed with HMAC-SHA256. The cookie contains only a random account id. It identifies the account but does not grant anything.
2. **Order.** The server creates the PayPal order at the catalog price. The browser cannot choose the product or the amount. The order is recorded as `pending` and linked to the account.
3. **Verification.** After approval, the server captures the order and then **re-reads the order from PayPal's API**. It must match the order this server created: the `GEI-DISCOVERY-50` product id, our invoice id, `50.00 USD`, and capture status `COMPLETED`. A verified PayPal webhook runs the same check, so access is granted even if the customer closes the tab.
4. **Entitlement.** Only a verified capture can create the record below:

   ```ts
   {
     entitlement: "GEI_DISCOVERY_PREMIUM",
     productId:   "GEI-DISCOVERY-50",
     status:      "active",            // active | refunded | revoked
     purchaserId: "acct_…",            // the account, not a PayPal identity
     transactionId: "<PayPal capture id>",
     grantedAt:   "2026-…Z",
     source:      "paypal"
   }
   ```

5. **Access.** Every protected request reads that record fresh. Only `status: "active"` opens the guide.

The checks run at three layers. `src/proxy.ts` rejects requests to `/guide/*` that have no valid signed session. The guide layout and **every guide page** call `requireEntitlement()` (`src/server/authz.ts`). Premium data comes only from `src/server/guide/content.ts`, and that data layer enforces the entitlement itself. Next.js layouts don't re-render on client navigation, so a page-level check is what makes the gate reliable.

### Restoring access on another device

The success screen lets a customer generate an **access key** (`GEI-XXXXX-…`, about 125 random bits). The key is shown once and only its SHA-256 hash is stored. Entering it at `/restore` signs that device into the same account. Generating a new key retires the old one. The key restores the *account*. Access still depends on the entitlement.

### Purchase states

| State | Where | Unlocks? |
|---|---|---|
| `pending` | order created, or the capture is pending at PayPal | no |
| `paid` | capture verified, transaction recorded | not yet (becomes `active` immediately after) |
| `active` | entitlement granted | **yes** |
| `failed` | capture declined/denied, or verification mismatch | no |
| `refunded` | PayPal confirms the capture `REFUNDED` | no — revoked |
| `revoked` | PayPal confirms the capture `REVERSED` (or an admin revokes it, from V1.1) | no |

A late `pending` or `failed` signal can never downgrade a paid order. A refunded transaction can never be re-activated by replaying an old `COMPLETED` event.

### Replay / duplicate protection

- **Transaction ledger:** `gei:discovery:txn:<captureId>` is created with Redis `SET NX`. Only one writer can record a capture. Every later delivery, whether a webhook retry, the capture route, or both at once, resolves to the existing records.
- **Entitlement record:** created with `SET NX`, one per (account, entitlement).
- **Event ledger:** `gei:discovery:event:<eventId>` is written after an event is handled successfully, so a known replay is skipped early. Failures are not marked as handled, so PayPal's retry can still succeed.
- **Self-healing:** if a grant crashed between recording the transaction and writing the entitlement, the next replay finishes the grant. It waits 30 seconds so it never races a grant still in progress.

### Multi-product ready

`src/lib/catalog.ts` is the only place products live. To add `GEI-DISCOVERY-10`, `GEI-MASTER-69` or `GEI-PREMIUM-99`, add a catalog entry. Their entitlement ids (`GEI_DISCOVERY_BASIC`, `GEI_MASTER`, `GEI_PREMIUM`) are already typed. Accounts, sessions, the ledger, the webhook and `requireEntitlement(<entitlement>)` need no changes. Only `GEI-DISCOVERY-50` is active in V1.0.

---

## Architecture

```
src/
  proxy.ts                     first-line gate for /guide/* (signed session required)
  lib/catalog.ts               products + entitlement ids (public facts only)
  server/
    authz.ts                   requireEntitlement() / getAccess() — THE access authority
    entitlements.ts            ledger: accounts, orders, transactions, entitlements, events
    payments.ts                create order · verify + capture · webhook processing
    paypal.ts                  PayPal REST client (Orders v2, captures, webhook verification)
    session.ts                 HMAC-signed account cookie
    access-keys.ts             access-key issue/restore (hash-only storage)
    log.ts                     structured, redacting JSON logs
    store/                     KeyValueStore: Upstash Redis (prod) · file / memory (dev, tests)
    guide/content.ts           premium data-access layer (enforces entitlement itself)
  app/
    page.tsx                   /            public landing
    preview/                   /preview     public preview + locked cards
    purchase/                  /purchase    PayPal checkout
    purchase/success/          /purchase/success  ACCESS GRANTED · PENDING · FAILED · NOT VERIFIED (server truth)
    locked/                    /locked      THIS GATE IS LOCKED
    restore/                   /restore     access-key restore
    guide/                     /guide, /guide/dashboard, /guide/roadmap, /guide/gates  (protected)
    api/checkout/order         POST  create PayPal order (session account)
    api/checkout/capture       POST  verify + capture after approval
    api/webhooks/paypal        POST  verified PayPal webhooks
    api/entitlement            GET   current account's entitlement status (no payment data)
    api/access                 GET   granted | denied
    api/access/key             POST  issue/rotate access key (active customers only)
    api/access/restore         POST  restore a session from an access key
```

### Routes

| Route | Access |
|---|---|
| `/`, `/preview`, `/purchase`, `/locked`, `/restore` | public |
| `/purchase/success` | public; the page shows only the state the server verified |
| `/guide`, `/guide/dashboard`, `/guide/roadmap`, `/guide/gates` | requires active `GEI_DISCOVERY_PREMIUM`; otherwise redirects to `/locked` before any premium markup is sent |

---

## Local development

```bash
npm install
cp .env.example .env.local      # set ENTITLEMENT_SESSION_SECRET; ENTITLEMENT_STORE=file for no-cloud dev
npm run dev
```

To check out locally you need PayPal **sandbox** credentials (`PAYPAL_ENV=sandbox`). Without PayPal credentials, the purchase page shows "Checkout is opening soon" and nothing can be bought.

### Tests

```bash
npm run typecheck
npm test                         # 31 ledger / webhook / replay / refund / session / key tests
npm run build && npm run test:e2e   # 63 HTTP checks against a real `next start` server
```

`test:e2e` starts the production build with a file-backed store, seeds accounts (active, refunded, none, and an active entitlement for a *different* product), then attacks the protected routes over HTTP. It covers no cookie, forged and unsigned cookies, URL parameters, fake success URLs, RSC payload requests, unsigned webhooks and cross-site POSTs. It also covers live revocation and access-key restore.

Against a deployment (black-box checks only, no seeding):

```bash
BASE_URL=https://<deployment> E2E_REMOTE=1 npm run test:e2e
```

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Secret | Purpose |
|---|---|---|
| `PAYPAL_ENV` | no | `live` (default) or `sandbox` |
| `PAYPAL_CLIENT_ID` | no | PayPal app client id (also loads the browser SDK) |
| `PAYPAL_CLIENT_SECRET` | **yes** | PayPal app secret, server only |
| `PAYPAL_WEBHOOK_ID` | **yes** | id of the webhook registered for `/api/webhooks/paypal` |
| `UPSTASH_REDIS_REST_URL` / `KV_REST_API_URL` | **yes** | entitlement store |
| `UPSTASH_REDIS_REST_TOKEN` / `KV_REST_API_TOKEN` | **yes** | entitlement store |
| `ENTITLEMENT_SESSION_SECRET` | **yes** | HMAC key for account cookies (32+ chars) |
| `ENTITLEMENT_STORE` | no | `redis` (default). `file`/`memory` are refused on Vercel |
| `NEXT_PUBLIC_APP_URL` | no | canonical URL |

The PayPal and Redis variable names match the existing GEI checkout, so both projects can use the same PayPal app and Upstash database.

---

## Deployment (Vercel)

1. Import `jawa-dam/GEI-Discovery-Guide` into Vercel. The Next.js framework preset needs no build overrides.
2. Add the environment variables above for Production (and Preview, using sandbox credentials).
3. In the PayPal Developer Dashboard, open the app and **add a webhook** pointing at `https://<domain>/api/webhooks/paypal` with these events:
   `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`.
   Copy its id into `PAYPAL_WEBHOOK_ID`.
4. Deploy, then run `BASE_URL=https://<domain> E2E_REMOTE=1 npm run test:e2e`.
5. Make one sandbox purchase from a phone, then refund it in the sandbox dashboard. Confirm the access screen and then the lock.

**Shared PayPal app note:** a PayPal app sends every event to every webhook registered on it. This app ignores (with `200`) any order it did not create, so GEI game purchases don't affect it. The game's webhook needs the matching change, which ignores captures for unknown packs instead of returning `500`. That change is on the `gei-mountain-ocean` branch for this build.

---

## Security considerations

- No secrets in client code. The browser receives only the public PayPal client id.
- Payment is never trusted from the browser. `?success=true`, `localStorage`, extra cookies and client state can't unlock anything. The e2e suite checks this.
- Every protected page checks access. Premium markup and RSC payloads are never sent to unauthorized clients, and are not hidden with CSS.
- Protected responses are `Cache-Control: private, no-store`.
- Webhooks are signature-verified through PayPal's `verify-webhook-signature` API. The capture is then re-fetched from PayPal before any grant.
- Unknown products, amount or currency mismatches and foreign orders never grant access (`entitlement.wrong_product`).
- POST APIs reject cross-origin requests. Session cookies are `httpOnly`, `Secure` in production and `SameSite=Lax`.
- Security headers include CSP (limited to PayPal), `X-Frame-Options: DENY`, `nosniff`, HSTS and a referrer policy.
- If the entitlement store is unavailable, access fails closed and the visitor sees a calm "gate cycling" screen.
- Customers never see implementation details.

### Audit logging

Every decision writes one JSON line: `payment.verified`, `payment.pending`, `payment.failed`, `payment.verification_failed`, `webhook.received`, `webhook.signature_invalid`, `webhook.duplicate`, `webhook.ignored`, `entitlement.created`, `entitlement.duplicate`, `entitlement.repaired`, `entitlement.revoked`, `entitlement.wrong_product`, `entitlement.unexpected_state`, `access.granted`, `access.denied`, `access.restored`, `access.key_issued`. Log lines carry account ids, order/capture ids and reasons. They never carry secrets, tokens, signatures, emails or access keys, and fields with names like those are redacted automatically.

---

## V1.0 acceptance tests

| # | Scenario | Covered by |
|---|---|---|
| 1–2 | Visitor opens the landing page and sees the $50 offer | e2e: public pages, landing copy |
| 3–5 | Purchase `GEI-DISCOVERY-50` → verified server-side → `GEI_DISCOVERY_PREMIUM` granted | unit: checkout → verified capture → entitlement |
| 6–8 | Customer enters the guide, the dashboard recognizes the entitlement, the roadmap is available | e2e: customer section |
| 9 | Unauthorized visitors cannot reach protected content (incl. RSC requests) | e2e: visitor, manipulation, refunded, wrong-product |
| 10 | Refresh keeps legitimate access | e2e: refresh |
| 11 | A fake success URL creates no access | e2e: fake success URL |
| 12 | Duplicate payment events create one entitlement | unit: duplicate / concurrent / capture+webhook replay |
| – | Invalid webhook → no entitlement | unit + e2e |
| – | Wrong product → no entitlement | unit (product id, amount, ledger) + e2e (`GEI_MASTER`) |
| – | Refund/revocation → locked | unit (refund webhook) + e2e (live revocation) |

The live sandbox purchase in **Deployment** step 5 is the final production check.

import "server-only";
import type { PaymentDeps } from "./payments";
import { paypal } from "./paypal";
import { getStore } from "./store";

export function paymentDeps(): PaymentDeps {
  return { store: getStore(), paypal };
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/*
 * PayPal Smart Buttons. This component never decides access. It asks the
 * server to create the order and, after approval, asks the server to
 * verify + capture it. Whatever happens, it then sends the customer to
 * /purchase/success, which independently checks the entitlement store.
 */

type PayPalButtons = { render(el: HTMLElement): Promise<void>; close?: () => void };
type PayPalNamespace = {
  Buttons(options: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }): PayPalButtons;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

type Phase = "loading" | "ready" | "verifying" | "cancelled" | "error" | "unavailable";

export function PayPalCheckout({ clientId, productId }: { clientId: string; productId: string }) {
  const router = useRouter();
  const slot = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let buttons: PayPalButtons | null = null;

    async function load() {
      if (!window.paypal) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>("script[data-gei-paypal]");
          const script = existing || document.createElement("script");
          script.addEventListener("load", () => resolve(), { once: true });
          script.addEventListener("error", () => reject(new Error("sdk")), { once: true });
          if (!existing) {
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
            script.dataset.geiPaypal = "1";
            document.head.appendChild(script);
          } else if (window.paypal) resolve();
        });
      }
      if (cancelled || !slot.current || !window.paypal) return;
      slot.current.innerHTML = "";
      buttons = window.paypal.Buttons({
        style: { layout: "vertical", shape: "pill", color: "blue", label: "pay", height: 55 },
        async createOrder() {
          const res = await fetch("/api/checkout/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId })
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.state === "active") {
            router.push("/purchase/success");
            throw new Error("already-active");
          }
          if (!res.ok || !data.orderId) throw new Error("order");
          return data.orderId as string;
        },
        async onApprove({ orderID }) {
          setPhase("verifying");
          await fetch("/api/checkout/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: orderID })
          }).catch(() => null);
          router.push("/purchase/success");
        },
        onCancel() {
          setPhase("cancelled");
        },
        onError() {
          setPhase(current => (current === "verifying" ? current : "error"));
        }
      });
      await buttons.render(slot.current);
      if (!cancelled) setPhase(current => (current === "loading" ? "ready" : current));
    }

    load().catch(() => !cancelled && setPhase("unavailable"));
    return () => {
      cancelled = true;
      buttons?.close?.();
    };
  }, [clientId, productId, router, attempt]);

  return (
    <div className="stack">
      {phase === "verifying" ? (
        <div className="notice" role="status">
          <strong className="mono">Verifying payment…</strong>
          <div className="dim">Hold tight — we are confirming your purchase with PayPal.</div>
        </div>
      ) : null}
      {phase === "cancelled" || phase === "error" ? (
        <div className="notice warn" role="alert">
          <strong className="mono">Payment failed</strong>
          <div className="dim">The purchase was not completed.</div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { setPhase("loading"); setAttempt(a => a + 1); }}>
            Try again
          </button>
        </div>
      ) : null}
      {phase === "unavailable" ? (
        <div className="notice warn" role="alert">
          Checkout could not load. Check your connection and refresh the page.
        </div>
      ) : null}
      {phase === "loading" ? <p className="faint mono" style={{ margin: 0 }}>Loading secure checkout…</p> : null}
      <div ref={slot} className="paypal-slot" hidden={phase === "verifying"} />
    </div>
  );
}

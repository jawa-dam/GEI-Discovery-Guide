"use client";

import { useState } from "react";

/* Reveals a freshly issued access key once. Issuing a new key retires the old one. */
export function AccessKeyCard() {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function issue() {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/access/key", { method: "POST" }).catch(() => null);
    const data = res && res.ok ? await res.json().catch(() => null) : null;
    if (data?.accessKey) setKey(data.accessKey);
    else setFailed(true);
    setBusy(false);
  }

  return (
    <div className="panel stack" style={{ textAlign: "left" }}>
      <p className="eyebrow">Access key</p>
      <h2 className="h3">Use the guide on another device</h2>
      {key ? (
        <>
          <div className="key-display" aria-label="Your access key">{key}</div>
          <p className="dim" style={{ margin: 0 }}>
            Save this key somewhere safe. It is shown only once. Enter it at <strong>Restore access</strong> on any
            device. Generating a new key replaces this one.
          </p>
        </>
      ) : (
        <>
          <p className="dim" style={{ margin: 0 }}>
            Your access lives on your account. Generate a private key to open it on your other devices or after clearing
            your browser.
          </p>
          <button type="button" className="btn btn-ghost" onClick={issue} disabled={busy}>
            {busy ? "Generating…" : "Generate access key"}
          </button>
          {failed ? <p className="faint" style={{ margin: 0 }}>Please try again in a moment.</p> : null}
        </>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RestoreForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/access/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey: value })
    }).catch(() => null);
    if (res?.ok) {
      router.push("/guide");
      router.refresh();
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="stack" style={{ textAlign: "left" }}>
      <div className="field">
        <label htmlFor="access-key">Access key</label>
        <input
          id="access-key"
          name="accessKey"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="GEI-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          value={value}
          onChange={e => setValue(e.target.value)}
          required
        />
      </div>
      {failed ? (
        <div className="notice warn" role="alert">That key didn&apos;t open the gate. Check it and try again.</div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Checking…" : "Restore access"}
      </button>
    </form>
  );
}

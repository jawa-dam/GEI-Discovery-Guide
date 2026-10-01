import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/Brand";
import { RestoreForm } from "@/components/RestoreForm";

export const metadata: Metadata = { title: "Restore access", robots: { index: false } };

export default function RestorePage() {
  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="state-screen">
        <div className="wrap">
          <div className="panel ticks state-card stack">
            <p className="eyebrow">Restore access</p>
            <h1 className="state-title" style={{ fontSize: "clamp(30px, 9vw, 48px)" }}>Return to the facility</h1>
            <p className="dim">Enter the access key you generated after purchase.</p>
            <RestoreForm />
            <p className="faint" style={{ fontSize: 16 }}>
              No key yet? <Link href="/purchase">Unlock the DAM Guide</Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

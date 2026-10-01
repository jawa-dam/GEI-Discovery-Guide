import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/Brand";
import { LockGlyph } from "@/components/LockGlyph";

export const metadata: Metadata = { title: "This gate is locked", robots: { index: false } };

export default async function LockedPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const busy = r === "busy";
  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="state-screen">
        <div className="wrap">
          <div className="panel ticks state-card">
            <LockGlyph />
            <p className="eyebrow">GEI Discovery Guide</p>
            <h1 className="state-title">{busy ? "Gate cycling" : "This gate is locked"}</h1>
            <p className="lead dim" style={{ marginTop: 18 }}>
              {busy
                ? "The facility is briefly unavailable. Please try again in a moment."
                : "The GEI Discovery Guide Premium Experience requires an active $50 entitlement."}
            </p>
            <div className="btn-row">
              {busy ? (
                <Link href="/guide" className="btn btn-primary">Try again</Link>
              ) : (
                <Link href="/purchase" className="btn btn-unlock">Unlock the DAM Guide — $50</Link>
              )}
              <Link href="/preview" className="btn btn-ghost">Return to preview</Link>
            </div>
            {!busy ? (
              <p className="faint" style={{ marginTop: 24, marginBottom: 0, fontSize: 16 }}>
                Already purchased on another device? <Link href="/restore">Restore access</Link>
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}

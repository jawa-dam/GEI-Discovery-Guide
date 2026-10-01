import type { Metadata } from "next";
import Link from "next/link";
import { DamDiagram } from "@/components/DamDiagram";
import { loadRoadmap } from "@/server/guide/content";

export const metadata: Metadata = { title: "The DAM Guide" };

export default async function GuideEntryPage() {
  const { gates } = await loadRoadmap("/guide");
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <span className="tag reveal"><span className="dot" /> Premium access verified</span>
          <h1 className="display reveal reveal-2" style={{ fontSize: "clamp(42px, 12vw, 96px)" }}>
            Welcome to the <span className="accent">DAM Guide</span>
          </h1>
          <p className="lead dim reveal reveal-3">Your investigation begins here.</p>
          <div className="btn-row reveal reveal-3">
            <Link href="/guide/dashboard" className="btn btn-primary">Open command center →</Link>
            <Link href="/guide/roadmap" className="btn btn-ghost">View the {gates.length} gates</Link>
          </div>
        </div>
        <div className="hero-art panel ticks reveal reveal-2">
          <DamDiagram />
        </div>
      </div>
    </section>
  );
}

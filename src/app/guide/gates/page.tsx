import type { Metadata } from "next";
import { GateGrid } from "@/components/GateViews";
import { GATE_STATUS_LABEL, loadRoadmap } from "@/server/guide/content";

export const metadata: Metadata = { title: "Gates" };

export default async function GatesPage() {
  const { gates } = await loadRoadmap("/guide/gates");
  return (
    <section className="section">
      <div className="wrap stack">
        <p className="eyebrow">Gate control</p>
        <h1 className="h2">The gates</h1>
        <p className="lead dim">Every gate is built and wired. Their rooms open in the next guide build.</p>
        <div style={{ marginTop: 28 }}>
          <GateGrid gates={gates} statusLabel={GATE_STATUS_LABEL} />
        </div>
      </div>
    </section>
  );
}

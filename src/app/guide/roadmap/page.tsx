import type { Metadata } from "next";
import { GateTimeline } from "@/components/GateViews";
import { GATE_STATUS_LABEL, loadRoadmap } from "@/server/guide/content";

export const metadata: Metadata = { title: "Roadmap" };

export default async function RoadmapPage() {
  const { gates } = await loadRoadmap("/guide/roadmap");
  return (
    <section className="section">
      <div className="wrap stack" style={{ maxWidth: 760 }}>
        <p className="eyebrow">GEI Discovery Roadmap</p>
        <h1 className="h2">The flow path</h1>
        <p className="lead dim">Each gate releases the next. Follow the water from the reservoir to certification.</p>
        <div style={{ marginTop: 28 }}>
          <GateTimeline gates={gates} statusLabel={GATE_STATUS_LABEL} />
        </div>
      </div>
    </section>
  );
}

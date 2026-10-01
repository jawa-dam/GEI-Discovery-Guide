import type { Metadata } from "next";
import Link from "next/link";
import { GateTimeline } from "@/components/GateViews";
import { GATE_STATUS_LABEL, loadRoadmap } from "@/server/guide/content";

export const metadata: Metadata = { title: "Command Center" };

export default async function DashboardPage() {
  const { gates, grantedAt } = await loadRoadmap("/guide/dashboard");
  const since = new Date(grantedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <section className="section" style={{ paddingBottom: 32 }}>
        <div className="wrap stack">
          <p className="eyebrow">Command center</p>
          <h1 className="h2">Welcome to the DAM Guide</h1>
          <p className="lead dim">Your investigation begins here.</p>
          <div className="status-strip" style={{ marginTop: 28 }}>
            <div className="panel meter">
              <span className="label">Access</span>
              <span className="value" style={{ color: "var(--cyan)" }}>Premium · Active</span>
            </div>
            <div className="panel meter">
              <span className="label">Investigator since</span>
              <span className="value">{since}</span>
            </div>
            <div className="panel meter">
              <span className="label">Gates cleared</span>
              <span className="value">0 / {gates.length}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="panel ticks stack">
            <p className="eyebrow">GEI Discovery Roadmap</p>
            <h2 className="h3" style={{ fontSize: 26 }}>Eight gates. One certification.</h2>
            <GateTimeline gates={gates} statusLabel={GATE_STATUS_LABEL} />
            <p className="placeholder-note">Placeholder · gate rooms open in the next guide build</p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <Link href="/guide/gates" className="btn btn-ghost">Inspect the gates</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

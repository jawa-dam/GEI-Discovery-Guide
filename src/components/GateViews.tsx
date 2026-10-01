import { GateGlyph } from "./GateGlyph";

type GateView = { id: string; code: string; title: string; final?: boolean };

export function GateTimeline({ gates, statusLabel }: { gates: readonly GateView[]; statusLabel: string }) {
  return (
    <ol className="gate-list">
      {gates.map(gate => (
        <li key={gate.id} className="gate-row">
          <span className={`gate-node${gate.final ? " final" : ""}`}>{gate.final ? "★" : gate.code}</span>
          <div className="gate-body">
            <h3>{gate.final ? "Final Gate" : `Gate ${gate.code}`} — {gate.title}</h3>
            <div className="status">{statusLabel}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function GateGrid({ gates, statusLabel }: { gates: readonly GateView[]; statusLabel: string }) {
  return (
    <div className="grid grid-2 grid-3">
      {gates.map(gate => (
        <article key={gate.id} id={gate.id} className="panel ticks gate-card">
          <GateGlyph final={gate.final} />
          <span className="card-num">{gate.final ? "FINAL GATE" : `GATE ${gate.code}`}</span>
          <h3>{gate.title}</h3>
          <span className={`tag${gate.final ? " tag-magenta" : ""}`} style={{ justifySelf: "start" }}>{statusLabel}</span>
        </article>
      ))}
    </div>
  );
}

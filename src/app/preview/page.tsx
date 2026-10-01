import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Brand";

export const metadata: Metadata = { title: "Preview" };

const LEARN = [
  ["Observation", "Train your eyes to notice before you interpret."],
  ["Patterns", "Spot repetition, structure and sequence in a text."],
  ["Language", "Read words as precise instruments, not decoration."],
  ["Systems", "Think in inputs, flows, controls and outputs."],
  ["Engineering comparisons", "Hold the text up against how real systems work."],
  ["Genesis investigation", "Apply the method to the opening chapters of Genesis."],
  ["GEI methodology", "A repeatable process you can run on your own."],
  ["Investigator exercises", "Hands-on missions that make you do the seeing."]
] as const;

const LOCKED = ["Genesis Investigation Lab", "Water Systems Blueprint", "GEI Investigator Missions", "Final Discovery Challenge"];

export default function PreviewPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="section">
          <div className="wrap stack">
            <p className="eyebrow">Inside the DAM Guide</p>
            <h1 className="h2">What you will learn</h1>
            <p className="lead dim" style={{ maxWidth: 720 }}>
              The Discovery Guide teaches a way of seeing. Here is the shape of it — the investigation itself is
              reserved for premium investigators.
            </p>
            <div className="grid grid-2 grid-4" style={{ marginTop: 32 }}>
              {LEARN.map(([title, body], i) => (
                <article key={title} className="panel learn-card">
                  <span className="card-num">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="h3">{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap stack">
            <p className="eyebrow">Premium rooms</p>
            <h2 className="h2">Locked until you enter</h2>
            <div className="grid grid-2" style={{ marginTop: 28 }}>
              {LOCKED.map(title => (
                <article key={title} className="panel ticks locked-card" aria-label={`${title} — locked`}>
                  <div className="ghost-lines" aria-hidden="true"><span /><span /><span /><span /></div>
                  <span className="tag tag-magenta" style={{ position: "relative", alignSelf: "flex-start", marginBottom: 14 }}>Premium</span>
                  <h3><span aria-hidden="true">🔒</span> {title.toUpperCase()}</h3>
                </article>
              ))}
            </div>
            <div className="btn-row">
              <Link href="/purchase" className="btn btn-unlock">Unlock the $50 DAM Guide</Link>
              <Link href="/" className="btn btn-ghost">Back to the facility</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

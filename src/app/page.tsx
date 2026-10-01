import Link from "next/link";
import { DamDiagram } from "@/components/DamDiagram";
import { SiteFooter, SiteHeader } from "@/components/Brand";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero">
          <div className="wrap">
            <div className="hero-copy">
              <p className="eyebrow reveal">GEI Discovery Guide</p>
              <h1 className="display reveal reveal-2">
                The <span className="accent">DAM</span> Guide
              </h1>
              <p className="hero-sub reveal reveal-2">Premium Investigation Experience</p>
              <p className="lead reveal reveal-3">
                Don&apos;t just read Genesis.
                <br />
                <strong>Learn how to investigate it.</strong>
              </p>
              <div className="btn-row reveal reveal-3">
                <Link href="/guide" className="btn btn-primary">Enter the Discovery Guide</Link>
                <Link href="/preview" className="btn btn-ghost">See what&apos;s inside</Link>
                <Link href="/purchase" className="btn btn-unlock">Unlock for $50</Link>
              </div>
            </div>
            <div className="hero-art panel ticks reveal reveal-2">
              <DamDiagram />
            </div>
          </div>
        </section>

        <section className="section manifesto">
          <div className="wrap">
            <p className="eyebrow">The Premise</p>
            <p className="big" style={{ marginTop: 20 }}>You are not here to be told what to see.</p>
            <p className="big"><span className="display accent" style={{ fontSize: "inherit" }}>You are here to learn how to see.</span></p>
            <div className="statement">
              <div><span className="mono">01</span><span><strong>Genesis</strong> is the text.</span></div>
              <div><span className="mono">02</span><span><strong>Observation</strong> is the instrument.</span></div>
              <div><span className="mono">03</span><span><strong>Engineering</strong> is the comparison.</span></div>
              <div><span className="mono">04</span><span><strong>You</strong> are the investigator.</span></div>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="panel ticks">
              <div className="grid grid-2" style={{ alignItems: "center" }}>
                <div className="stack">
                  <span className="tag tag-magenta"><span className="dot" /> Premium edition</span>
                  <h2 className="h2">One purchase.<br />Your own investigation facility.</h2>
                  <p className="dim" style={{ margin: 0 }}>
                    A guided, mobile-first learning environment — not a PDF. Your access is tied to your
                    account and verified on our servers every time you enter.
                  </p>
                </div>
                <div className="stack">
                  <div className="price"><strong>$50</strong><span className="mono dim">USD · one time</span></div>
                  <div className="btn-row" style={{ marginTop: 16 }}>
                    <Link href="/purchase" className="btn btn-unlock">Unlock for $50</Link>
                    <Link href="/preview" className="btn btn-ghost">See what&apos;s inside</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

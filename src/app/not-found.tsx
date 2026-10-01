import Link from "next/link";
import { SiteHeader } from "@/components/Brand";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="state-screen">
        <div className="wrap">
          <div className="panel ticks state-card">
            <p className="eyebrow">Off the blueprint</p>
            <h1 className="state-title">No channel here</h1>
            <div className="btn-row">
              <Link href="/" className="btn btn-primary">Back to the facility</Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

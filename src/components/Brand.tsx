import Link from "next/link";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0b0d1a" stroke="#2fd2ff" strokeOpacity="0.6" />
      <path d="M8 30 L14 12 H20 L26 30 Z" fill="none" stroke="#2fd2ff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M22 22 H33" stroke="#f310ba" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 27 H33" stroke="#ff9df2" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="22" r="2.4" fill="#2fd2ff" />
    </svg>
  );
}

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="GEI Discovery Guide home">
          <BrandMark />
          <span className="brand-text">
            <strong>GEI DISCOVERY</strong>
            <span>THE DAM GUIDE</span>
          </span>
        </Link>
        {cta ? (
          <Link href="/purchase" className="header-cta">
            UNLOCK $50
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <nav aria-label="Footer">
          <Link href="/">Home</Link>
          <Link href="/preview">Preview</Link>
          <Link href="/purchase">Unlock</Link>
          <Link href="/restore">Restore access</Link>
        </nav>
        <p style={{ margin: 0 }}>GEI Discovery Guide · The DAM Guide — Premium Investigation Experience</p>
      </div>
    </footer>
  );
}

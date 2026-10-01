export function LockGlyph({ className = "state-icon" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="#3d3dea" strokeOpacity="0.6" strokeDasharray="4 8" />
      <circle className="gate-glow" cx="60" cy="60" r="44" fill="none" stroke="#f310ba" strokeOpacity="0.5" />
      <path d="M42 54 V44 a18 18 0 0 1 36 0 V54" fill="none" stroke="#ff9df2" strokeWidth="5" strokeLinecap="round" />
      <rect x="34" y="54" width="52" height="40" rx="8" fill="#0b0d1a" stroke="#f310ba" strokeWidth="3" />
      <circle cx="60" cy="72" r="5" fill="#f310ba" />
      <path d="M60 76 V84" stroke="#f310ba" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function FlowGlyph({ className = "state-icon" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="#2fd2ff" strokeOpacity="0.5" strokeDasharray="4 8" />
      <circle className="gate-glow" cx="60" cy="60" r="44" fill="rgba(47,210,255,0.08)" stroke="#2fd2ff" strokeOpacity="0.7" />
      <path d="M60 30 C 48 48, 40 58, 40 70 a20 20 0 0 0 40 0 C 80 58, 72 48, 60 30 Z" fill="#2fd2ff" fillOpacity="0.25" stroke="#2fd2ff" strokeWidth="3" />
      <path className="flow-line" d="M20 96 H100" stroke="#ff9df2" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

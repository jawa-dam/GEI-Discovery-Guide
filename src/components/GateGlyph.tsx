/* A glowing sluice gate in a dam wall. `final` uses the magenta certification glow. */
export function GateGlyph({ final = false, open = false, className = "gate-svg" }: { final?: boolean; open?: boolean; className?: string }) {
  const color = final ? "#f310ba" : "#2fd2ff";
  return (
    <svg className={className} viewBox="0 0 72 72" aria-hidden="true">
      <rect x="4" y="4" width="64" height="64" rx="14" fill="#0b0d1a" stroke={color} strokeOpacity="0.5" />
      <path d="M14 58 V22 L36 12 L58 22 V58" fill="none" stroke={color} strokeWidth="2" />
      <rect x="24" y={open ? 26 : 34} width="24" height="24" rx="3" fill="#06070d" stroke={color} strokeWidth="2" />
      <rect className="gate-glow" x="28" y={open ? 30 : 38} width="16" height="16" rx="2" fill={color} opacity="0.8" />
      <path className="flow-line slow" d="M10 62 H62" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

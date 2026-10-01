/* Reservoir + dam cross-section blueprint with live hydraulic flow lines. Decorative. */
export function DamDiagram({ className = "" }: { className?: string }) {
  return (
    <svg className={`dam-diagram ${className}`} viewBox="0 0 560 420" role="img" aria-label="Blueprint of a dam holding back a reservoir, with water flowing through its gates">
      <defs>
        <linearGradient id="dd-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2fd2ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3d3dea" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="dd-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1f3d" />
          <stop offset="1" stopColor="#0b0d1a" />
        </linearGradient>
        <linearGradient id="dd-out" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2fd2ff" />
          <stop offset="1" stopColor="#f310ba" />
        </linearGradient>
        <pattern id="dd-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#2fd2ff" strokeOpacity="0.16" strokeWidth="2" />
        </pattern>
      </defs>

      {/* measurement frame */}
      <g stroke="#2fd2ff" strokeOpacity="0.35" fill="none" strokeWidth="1">
        <rect x="12" y="12" width="536" height="396" rx="10" />
        <line x1="12" y1="352" x2="548" y2="352" strokeDasharray="4 6" />
        <line x1="40" y1="120" x2="40" y2="352" />
        <line x1="34" y1="120" x2="46" y2="120" />
        <line x1="34" y1="352" x2="46" y2="352" />
      </g>
      <text x="52" y="112" fill="#2fd2ff" fontFamily="monospace" fontSize="22" fontWeight="700" letterSpacing="2">RESERVOIR</text>
      <text x="420" y="44" fill="#ff9df2" fontFamily="monospace" fontSize="20" fontWeight="700" letterSpacing="2">FIG. 01</text>

      {/* reservoir */}
      <g className="water-surface">
        <path d="M40 140 Q120 132 200 140 T268 140 L268 352 L40 352 Z" fill="url(#dd-water)" />
        <path d="M40 140 Q120 132 200 140 T268 140" stroke="#2fd2ff" strokeWidth="2" fill="none" />
      </g>

      {/* dam wall (gravity section) */}
      <path d="M262 100 L300 100 L392 352 L262 352 Z" fill="url(#dd-wall)" stroke="#2fd2ff" strokeWidth="2" />
      <path d="M262 100 L300 100 L392 352 L262 352 Z" fill="url(#dd-hatch)" />
      <line x1="252" y1="100" x2="310" y2="100" stroke="#2fd2ff" strokeWidth="3" />

      {/* gates */}
      {[180, 240, 300].map((y, i) => (
        <g key={y}>
          <rect x="262" y={y} width="22" height="26" rx="4" fill="#06070d" stroke="#2fd2ff" strokeWidth="2" />
          <rect className="gate-glow" x="266" y={y + 4} width="14" height="18" rx="2" fill={i === 2 ? "#f310ba" : "#2fd2ff"} opacity="0.85" />
        </g>
      ))}

      {/* hydraulic lines through the dam */}
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path className="flow-line" d="M200 193 L262 193 L330 193 Q350 193 360 215 L392 300" stroke="#2fd2ff" />
        <path className="flow-line slow" d="M200 253 L262 253 L350 253 Q368 253 380 280 L400 326" stroke="#3d3dea" />
        <path className="flow-line" d="M200 313 L262 313 L392 330 L520 330" stroke="url(#dd-out)" />
      </g>

      {/* tailwater */}
      <path d="M392 340 Q440 334 480 340 T548 340 L548 352 L392 352 Z" fill="#2fd2ff" opacity="0.25" />

      {/* annotation leaders */}
      <g stroke="#ff9df2" strokeOpacity="0.7" strokeWidth="1" fill="none">
        <path d="M300 100 L340 76 L380 76" />
        <circle cx="300" cy="100" r="4" fill="#ff9df2" />
      </g>
      <text x="386" y="83" fill="#ff9df2" fontFamily="monospace" fontSize="22" fontWeight="700" letterSpacing="1.5">CREST</text>
      <text x="280" y="392" textAnchor="middle" fill="#a9b4d6" fontFamily="monospace" fontSize="20" fontWeight="700" letterSpacing="3">OBSERVE · COMPARE · TEST</text>
    </svg>
  );
}

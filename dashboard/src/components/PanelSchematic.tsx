/** Side view of one tracker row: a panel rotating about its torque tube on a post. */
export function PanelSchematic({ angle, target }: { angle: number; target: number }) {
  const cx = 150, cy = 95
  return (
    <svg viewBox="0 0 300 170" className="schematic" aria-label={`Panel at ${angle.toFixed(1)} degrees`}>
      {/* ground */}
      <line x1="10" y1="160" x2="290" y2="160" className="ground" />
      <text x="16" y="152" className="compass">W</text>
      <text x="274" y="152" className="compass">E</text>
      {/* post */}
      <rect x={cx - 5} y={cy} width="10" height="65" className="post" />
      {/* target ghost */}
      <g style={{ transform: `rotate(${target}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.2s linear' }}>
        <rect x={cx - 100} y={cy - 6} width="200" height="12" className="panel-ghost" />
      </g>
      {/* live panel */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.2s linear' }}>
        <rect x={cx - 100} y={cy - 6} width="200" height="12" rx="1" className="panel" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={cx - 100 + (i + 1) * 20} y1={cy - 6} x2={cx - 100 + (i + 1) * 20} y2={cy + 6} className="cell-line" />
        ))}
        <line x1={cx - 100} y1={cy - 6} x2={cx + 100} y2={cy - 6} className="panel-face" />
      </g>
      {/* pivot */}
      <circle cx={cx} cy={cy} r="5" className="pivot" />
    </svg>
  )
}

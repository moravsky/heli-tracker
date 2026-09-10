import type { Sample } from '../types'

export function Sparkline({ data, width = 120, height = 28 }: { data: Sample[]; width?: number; height?: number }) {
  const pts = data.slice(-90)
  if (pts.length < 2) return <svg width={width} height={height} className="spark" />
  const max = 2.5, min = 0
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * width
      const y = height - ((Math.min(max, Math.max(min, p.volts)) - min) / (max - min)) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} className="spark" viewBox={`0 0 ${width} ${height}`}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

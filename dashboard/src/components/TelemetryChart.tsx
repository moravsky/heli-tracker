import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Sample } from '../types'

const fmtTime = (t: number) => {
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

export function TelemetryChart({ data }: { data: Sample[] }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
          <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} stroke="var(--fg-dim)" fontSize={11} minTickGap={40} />
          <YAxis yAxisId="v" domain={[0, 2.5]} stroke="var(--accent)" fontSize={11} width={36} tickFormatter={(v: number) => v.toFixed(1)} />
          <YAxis yAxisId="a" orientation="right" domain={[-90, 90]} ticks={[-90, -45, 0, 45, 90]} stroke="var(--angle)" fontSize={11} width={36} />
          <Tooltip
            labelFormatter={(t) => fmtTime(Number(t))}
            formatter={(val, name) => [typeof val === 'number' ? val.toFixed(name === 'volts' ? 3 : 1) : String(val), name === 'volts' ? 'Panel V' : 'Angle °']}
            contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: 12 }}
          />
          <Line yAxisId="v" dataKey="volts" stroke="var(--accent)" dot={false} isAnimationActive={false} strokeWidth={2} />
          <Line yAxisId="a" dataKey="angle" stroke="var(--angle)" dot={false} isAnimationActive={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

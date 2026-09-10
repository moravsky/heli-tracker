import type { RowDto, Sample } from '../types'
import { Sparkline } from './Sparkline'

interface Props {
  rows: RowDto[]
  selectedId: string | null
  onSelect: (id: string) => void
  history: (id: string) => Sample[]
}

export function FleetPanel({ rows, selectedId, onSelect, history }: Props) {
  return (
    <aside className="fleet">
      <h2>Fleet <span className="muted">{rows.length} rows</span></h2>
      {rows.map((r) => (
        <button
          key={r.id}
          className={`row-card ${r.id === selectedId ? 'selected' : ''}`}
          onClick={() => onSelect(r.id)}
        >
          <div className="row-card-head">
            <span className={`dot ${r.online ? 'on' : 'off'}`} />
            <span className="row-name">{r.name}</span>
            {r.simulated && <span className="badge">SIM</span>}
          </div>
          <div className="row-card-body">
            <div className="stat">
              <span className="stat-val">{r.angle.toFixed(1)}°</span>
              <span className="stat-lbl">angle</span>
            </div>
            <div className="stat">
              <span className="stat-val">{r.volts.toFixed(2)} V</span>
              <span className="stat-lbl">panel</span>
            </div>
            <Sparkline data={history(r.id)} />
          </div>
        </button>
      ))}
    </aside>
  )
}

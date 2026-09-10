import { useEffect, useState } from 'react'
import { api } from '../api'
import { MAX_ANGLE, MIN_ANGLE, type RowDto, type Sample } from '../types'
import type { FindSunState } from '../useFindSun'
import { PanelSchematic } from './PanelSchematic'
import { TelemetryChart } from './TelemetryChart'

interface Props {
  row: RowDto
  history: Sample[]
  findSun: FindSunState
  onFindSun: () => void
  onCancelFindSun: () => void
}

export function RowDetail({ row, history, findSun, onFindSun, onCancelFindSun }: Props) {
  const [slider, setSlider] = useState(row.targetAngle)
  const [dragging, setDragging] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stepText, setStepText] = useState('15')

  // Keep the slider in sync with the server's target unless the user is mid-drag.
  useEffect(() => { if (!dragging) setSlider(row.targetAngle) }, [row.targetAngle, row.id, dragging])

  const run = (p: Promise<unknown>) => p.then(() => setErr(null)).catch((e) => setErr(String(e)))
  const goTo = (deg: number) => { setSlider(deg); run(api.setTarget(row.id, deg)) }
  const busy = findSun.running
  const step = Math.abs(Number(stepText)) || 0
  const clamp = (v: number) => Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.round(v * 10) / 10))
  const nudge = (dir: -1 | 1) => { if (step > 0) goTo(clamp(row.targetAngle + dir * step)) }

  return (
    <section className="detail">
      <header className="detail-head">
        <div>
          <h1>{row.name}</h1>
          <div className="muted small">
            {row.id} · {row.online ? 'online' : 'offline'}
            {row.lastSeen && ` · last seen ${new Date(row.lastSeen).toLocaleTimeString()}`}
            {row.simulated && <span className="badge">SIMULATED</span>}
          </div>
        </div>
        <div className="readouts">
          <div className="readout">
            <span className="readout-val">{row.angle.toFixed(1)}<span className="unit">°</span></span>
            <span className="readout-lbl">angle · target {Number.isInteger(row.targetAngle) ? row.targetAngle : row.targetAngle.toFixed(1)}°</span>
          </div>
          <div className="readout accent">
            <span className="readout-val">{row.volts.toFixed(2)}<span className="unit">V</span></span>
            <span className="readout-lbl">panel output</span>
          </div>
        </div>
      </header>

      <PanelSchematic angle={row.angle} target={row.targetAngle} />

      <div className="controls">
        <div className="slider-row">
          <span className="muted">{MIN_ANGLE}°</span>
          <input
            type="range" min={MIN_ANGLE} max={MAX_ANGLE} step={1} value={slider} disabled={busy}
            onChange={(e) => setSlider(Number(e.target.value))}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => { setDragging(false); goTo(slider) }}
            onKeyUp={() => goTo(slider)}
          />
          <span className="muted">+{MAX_ANGLE}°</span>
          <span className="slider-val">{slider}°</span>
        </div>
        <div className="buttons">
          <label className="step">
            <span className="muted">Step</span>
            <input type="number" min={0.5} max={180} step={0.5} value={stepText} disabled={busy}
              onChange={(e) => setStepText(e.target.value)} />
            <span className="muted">°</span>
          </label>
          <button disabled={busy || step === 0} onClick={() => nudge(-1)}>West −{step}°</button>
          <button disabled={busy} onClick={() => goTo(0)}>Flat 0°</button>
          <button disabled={busy || step === 0} onClick={() => nudge(1)}>East +{step}°</button>
          <span className="spacer" />
          <button disabled={busy} onClick={() => run(api.zero(row.id))} title="Set current position as 0°">Zero</button>
          <button className="danger" onClick={() => { onCancelFindSun(); run(api.stop(row.id)) }}>Stop</button>
          {busy
            ? <button className="primary" onClick={onCancelFindSun}>Cancel sweep</button>
            : <button className="primary" onClick={onFindSun}>Find sun</button>}
        </div>
        {(busy || findSun.message) && (
          <div className="findsun">
            <div className="progress"><div style={{ width: `${(findSun.step / findSun.total) * 100}%` }} /></div>
            <span>{findSun.message}</span>
            {findSun.points.length > 0 && (
              <div className="sweep">
                {findSun.points.map((p) => (
                  <div key={p.angle} className={`sweep-bar ${findSun.best?.angle === p.angle ? 'best' : ''}`} title={`${p.angle}°: ${p.volts.toFixed(2)} V`}>
                    <div style={{ height: `${(p.volts / 2.5) * 100}%` }} />
                    <span>{p.angle}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {err && <div className="error">{err}</div>}
      </div>

      <div className="chart-head">
        <h3>Last 2 minutes</h3>
        <span className="legend"><i style={{ background: 'var(--accent)' }} /> panel volts <i style={{ background: 'var(--angle)' }} /> angle</span>
      </div>
      <TelemetryChart data={history} />
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { FleetPanel } from './components/FleetPanel'
import { RowDetail } from './components/RowDetail'
import { useFindSun } from './useFindSun'
import { useTelemetry } from './useTelemetry'

export default function App() {
  const { rows, link, history } = useTelemetry()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]

  useEffect(() => { if (!selectedId && rows.length) setSelectedId(rows[0].id) }, [rows, selectedId])

  // Find-sun reads the freshest row state through a ref so it isn't tied to render timing.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const findSun = useFindSun(() => rowsRef.current.find((r) => r.id === selected?.id))

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">◐ Tracker Control</span>
        <span className="muted">mini single-axis fleet · gateway → hub → dashboard</span>
        <span className={`link ${link}`}>{link === 'live' ? '● live (SignalR)' : link === 'polling' ? '● polling fallback' : '○ connecting'}</span>
      </header>
      <main className="layout">
        <FleetPanel rows={rows} selectedId={selected?.id ?? null} onSelect={setSelectedId} history={history} />
        {selected ? (
          <RowDetail
            row={selected}
            history={history(selected.id)}
            findSun={findSun.state}
            onFindSun={() => findSun.start(selected.id)}
            onCancelFindSun={findSun.cancel}
          />
        ) : (
          <section className="detail empty">Waiting for gateway…</section>
        )}
      </main>
    </div>
  )
}

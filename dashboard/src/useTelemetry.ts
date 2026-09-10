import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { api } from './api'
import { HISTORY_SECONDS, type LinkState, type RowDto, type Sample } from './types'

const FLUSH_MS = 250
const POLL_LIVE_MS = 2000 // slow poll for targetAngle/online even when hub is up
const POLL_FALLBACK_MS = 500

/**
 * Keeps the fleet state and a rolling 2-minute telemetry history per row.
 * Primary feed is the SignalR hub; falls back to polling /api/rows if the hub is down.
 */
export function useTelemetry() {
  const [rows, setRows] = useState<RowDto[]>([])
  const [link, setLink] = useState<LinkState>('connecting')
  const [tick, setTick] = useState(0)
  const histRef = useRef<Map<string, Sample[]>>(new Map())
  const linkRef = useRef<LinkState>('connecting')

  const push = (rowId: string, s: Sample) => {
    const list = histRef.current.get(rowId) ?? []
    list.push(s)
    const cutoff = Date.now() - HISTORY_SECONDS * 1000
    while (list.length && list[0].ts < cutoff) list.shift()
    histRef.current.set(rowId, list)
  }

  useEffect(() => {
    let alive = true

    const seed = async () => {
      const list = await api.rows()
      if (!alive) return
      setRows(list)
      await Promise.all(
        list.map(async (r) => {
          const h = await api.history(r.id, HISTORY_SECONDS)
          histRef.current.set(r.id, h)
        }),
      )
    }
    seed().catch(console.error)

    const conn = new signalR.HubConnectionBuilder()
      .withUrl('/hub/telemetry')
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    conn.on('telemetry', (m: { rowId: string; angle: number; volts: number; ts: string }) => {
      push(m.rowId, { angle: m.angle, volts: m.volts, ts: Date.parse(m.ts) })
      setRows((prev) =>
        prev.map((r) =>
          r.id === m.rowId ? { ...r, angle: m.angle, volts: m.volts, lastSeen: m.ts, online: true } : r,
        ),
      )
    })
    const setLinkState = (s: LinkState) => { linkRef.current = s; setLink(s) }
    conn.onreconnecting(() => setLinkState('polling'))
    conn.onreconnected(() => setLinkState('live'))
    conn.onclose(() => setLinkState('polling'))
    conn.start().then(() => setLinkState('live')).catch(() => setLinkState('polling'))

    // Polling: full refresh when hub is down, light refresh (target/online) when it is up.
    let pollTimer: number | undefined
    const poll = async () => {
      try {
        const list = await api.rows()
        if (!alive) return
        if (linkRef.current !== 'live') {
          const now = Date.now()
          list.forEach((r) => push(r.id, { angle: r.angle, volts: r.volts, ts: now }))
          setRows(list)
        } else {
          setRows((prev) =>
            list.map((r) => {
              const p = prev.find((x) => x.id === r.id)
              return p ? { ...r, angle: p.angle, volts: p.volts } : r
            }),
          )
        }
      } catch (e) {
        console.warn('poll failed', e)
      } finally {
        if (alive) pollTimer = window.setTimeout(poll, linkRef.current === 'live' ? POLL_LIVE_MS : POLL_FALLBACK_MS)
      }
    }
    pollTimer = window.setTimeout(poll, POLL_LIVE_MS)

    const flush = window.setInterval(() => setTick((t) => t + 1), FLUSH_MS)

    return () => {
      alive = false
      window.clearTimeout(pollTimer)
      window.clearInterval(flush)
      conn.stop().catch(() => {})
    }
  }, [])

  // Return a copy: consumers (Recharts) may freeze what they receive, and we keep mutating the buffer.
  const history = (rowId: string): Sample[] => (histRef.current.get(rowId) ?? []).slice()
  return { rows, link, history, tick }
}

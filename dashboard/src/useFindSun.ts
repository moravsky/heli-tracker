import { useRef, useState } from 'react'
import { api } from './api'
import type { RowDto } from './types'

export interface SweepPoint { angle: number; volts: number }
export interface FindSunState {
  running: boolean
  step: number
  total: number
  points: SweepPoint[]
  best: SweepPoint | null
  message: string
}

const STEP_DEG = 15
const ANGLES = Array.from({ length: 180 / STEP_DEG + 1 }, (_, i) => -90 + i * STEP_DEG)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Client-side hill-climb: sweep the row across its range, sample panel volts at each
 * stop, then park at the brightest angle. Uses live telemetry to know when the motor settled.
 */
export function useFindSun(getRow: () => RowDto | undefined) {
  const [state, setState] = useState<FindSunState>({
    running: false, step: 0, total: ANGLES.length, points: [], best: null, message: '',
  })
  const abortRef = useRef(false)

  const waitForAngle = async (target: number, timeoutMs: number) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if (abortRef.current) throw new Error('aborted')
      const r = getRow()
      if (r && Math.abs(r.angle - target) < 1.0) return
      await sleep(100)
    }
  }

  const sampleVolts = async (n = 4) => {
    let sum = 0
    for (let i = 0; i < n; i++) { await sleep(200); sum += getRow()?.volts ?? 0 }
    return sum / n
  }

  const start = async (rowId: string) => {
    abortRef.current = false
    const points: SweepPoint[] = []
    setState({ running: true, step: 0, total: ANGLES.length, points, best: null, message: 'Sweeping…' })
    try {
      for (let i = 0; i < ANGLES.length; i++) {
        const a = ANGLES[i]
        await api.setTarget(rowId, a)
        await waitForAngle(a, 12000)
        const volts = await sampleVolts()
        points.push({ angle: a, volts })
        setState((s) => ({ ...s, step: i + 1, points: [...points], message: `Sweeping… ${a}° = ${volts.toFixed(2)} V` }))
      }
      const best = points.reduce((b, p) => (p.volts > b.volts ? p : b), points[0])
      await api.setTarget(rowId, best.angle)
      setState((s) => ({ ...s, running: false, best, message: `Best: ${best.angle}° (${best.volts.toFixed(2)} V)` }))
    } catch (e) {
      setState((s) => ({ ...s, running: false, message: (e as Error).message === 'aborted' ? 'Cancelled' : `Failed: ${(e as Error).message}` }))
    }
  }

  const cancel = () => { abortRef.current = true }
  return { state, start, cancel }
}

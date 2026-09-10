import type { RowDto, Sample } from './types'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${r.status}`)
  return r.json() as Promise<T>
}

const post = (url: string, body?: unknown) =>
  json(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const api = {
  rows: () => json<RowDto[]>('/api/rows'),
  history: async (id: string, seconds: number): Promise<Sample[]> => {
    const raw = await json<{ angle: number; volts: number; ts: string }[]>(
      `/api/rows/${id}/history?seconds=${seconds}`,
    )
    return raw.map((s) => ({ angle: s.angle, volts: s.volts, ts: Date.parse(s.ts) }))
  },
  setTarget: (id: string, angle: number) => post(`/api/rows/${id}/target`, { angle }),
  stow: (id: string) => post(`/api/rows/${id}/stow`),
  zero: (id: string) => post(`/api/rows/${id}/zero`),
  stop: (id: string) => post(`/api/rows/${id}/stop`),
}

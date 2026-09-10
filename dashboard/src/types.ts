export interface RowDto {
  id: string
  name: string
  angle: number
  targetAngle: number
  volts: number
  online: boolean
  lastSeen: string | null
  simulated: boolean
}

export interface Sample {
  angle: number
  volts: number
  ts: number // epoch ms
}

export type LinkState = 'connecting' | 'live' | 'polling'

export const MIN_ANGLE = -90
export const MAX_ANGLE = 90
export const HISTORY_SECONDS = 120

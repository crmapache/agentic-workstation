import type { CSSProperties } from 'react'

/**
 * Доля цвета образца - его собственная, из ползунка под пальцем: образец
 * перекрашивается сразу, а настройка пишется с паузой.
 */
export const vividStyle = (vivid: number): CSSProperties =>
  ({ '--gauge-vivid': `${vivid}%` }) as CSSProperties

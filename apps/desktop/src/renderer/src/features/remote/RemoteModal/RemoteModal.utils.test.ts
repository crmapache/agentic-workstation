import { it, expect, describe } from 'vitest'

import { countdown, qrDataUrl } from './RemoteModal.utils'

describe('окно Remote Control', () => {
  it('отсчёт кода - минуты и секунды, вверх, без минуса', () => {
    expect(countdown(180_000, 0)).toBe('3:00')
    expect(countdown(61_500, 0)).toBe('1:02')
    expect(countdown(0, 5_000)).toBe('0:00')
  })

  it('QR - SVG в data URL', () => {
    expect(qrDataUrl('https://relay.example/pair#aw1.x').startsWith('data:image/svg+xml')).toBe(
      true,
    )
  })
})

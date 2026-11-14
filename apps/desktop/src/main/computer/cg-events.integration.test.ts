import { it, expect, describe } from 'vitest'

import { macInput } from './cg-events'

// Настоящий CoreGraphics через koffi, только чтение: событий не шлёт, мышь не двигает. Ловит
// то, чего не видит тест руки на подделке, - типы, которые koffi отдаёт на самом деле (64-битные
// флаги приходят числом, а не BigInt, и смешать их нельзя).
describe.skipIf(process.platform !== 'darwin')('mac input, read side', () => {
  it('reads where the pointer is', () => {
    const at = macInput.cursor()

    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true)
  })

  it('reads held modifiers and buttons as plain values', () => {
    expect(typeof macInput.heldFlags()).toBe('number')
    expect(typeof macInput.isButtonHeld()).toBe('boolean')
  })
})

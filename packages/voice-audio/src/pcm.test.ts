import { it, expect, describe } from 'vitest'

import { pcmToFloat } from './pcm'

describe('pcmToFloat', () => {
  it('turns PCM16 bytes into samples from -1 to 1', () => {
    const pcm = new Uint8Array(new Int16Array([0, 0x4000, -0x8000]).buffer)

    expect([...pcmToFloat(pcm)]).toEqual([0, 0.5, -1])
  })
})

import { it, expect, describe } from 'vitest'

import { FrameError, FRAME_SEALED, HEADER_BYTES } from '@agentic-workstation/remote-protocol/frame'

import {
  headerOf,
  buildFrame,
  parseFrame,
  decodeAddress,
  encodeAddress,
  heartbeatFrame,
} from './frame'
import { ReplayWindow } from './replay-window'

const address = (fill: number) => new Uint8Array(16).fill(fill)

describe('конверт в главном процессе', () => {
  it('возвращается тем же, адреса - Buffer, заголовок - 42 байта', () => {
    const envelope = parseFrame(
      buildFrame(FRAME_SEALED, address(1), address(2), 99n, Buffer.from('sealed')),
      1024,
    )

    expect(envelope.to.equals(Buffer.from(address(1)))).toBe(true)
    expect(envelope.from.equals(Buffer.from(address(2)))).toBe(true)
    expect(envelope.counter).toBe(99n)
    expect(envelope.body.toString()).toBe('sealed')
    expect(headerOf(FRAME_SEALED, address(1), address(2), 1n)).toHaveLength(HEADER_BYTES)
  })

  it('сердцебиение - пустой кадр самому себе', () => {
    const beat = parseFrame(heartbeatFrame(Buffer.from(address(7))), 1024)

    expect(beat.to.equals(beat.from)).toBe(true)
    expect(beat.body).toHaveLength(0)
  })

  it('кривой кадр и адрес - FrameError', () => {
    expect(() => parseFrame(new Uint8Array(10), 1024)).toThrow(FrameError)
    expect(() => decodeAddress('short')).toThrow(FrameError)
    expect(decodeAddress(encodeAddress(address(0xfb))).equals(Buffer.from(address(0xfb)))).toBe(
      true,
    )
  })
})

describe('окно повторов', () => {
  it('один номер принимается один раз, порядок может плыть внутри окна', () => {
    const window = new ReplayWindow()

    expect(window.accept(5n)).toBe(true)
    expect(window.accept(5n)).toBe(false)
    expect(window.accept(3n)).toBe(true)
    expect(window.accept(3n)).toBe(false)
    expect(window.accept(70n)).toBe(true)
    expect(window.accept(6n)).toBe(false)
    expect(window.accept(-1n)).toBe(false)
  })
})

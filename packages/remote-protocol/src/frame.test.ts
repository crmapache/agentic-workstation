import { it, expect, describe } from 'vitest'

import { toBase64, fromBase64, toBase64Url, fromBase64Url } from './base64'
import { nonceOf, macInput, HKDF_INFO, fingerprintOf, sessionSaltText } from './crypto-spec'
import {
  FRAME_PUSH,
  FrameError,
  decodeFrame,
  encodeFrame,
  encodeHeader,
  FRAME_SEALED,
  HEADER_BYTES,
  decodeAddress,
  encodeAddress,
} from './frame'

const address = (fill: number) => new Uint8Array(16).fill(fill)

describe('конверт релея', () => {
  it('раскладка байт: версия, вид, кому, от кого, счётчик big-endian', () => {
    const frame = encodeFrame(FRAME_SEALED, address(0xaa), address(0xbb), 0x0102n, Uint8Array.of(7))

    expect(frame.length).toBe(HEADER_BYTES + 1)
    expect(frame[0]).toBe(1)
    expect(frame[1]).toBe(1)
    expect(frame[2]).toBe(0xaa)
    expect(frame[18]).toBe(0xbb)
    expect([...frame.subarray(34, 42)]).toEqual([0, 0, 0, 0, 0, 0, 1, 2])
    expect(frame[42]).toBe(7)
  })

  it('возвращается таким же, а заголовок без тела - ровно 42 байта', () => {
    const top = (1n << 64n) - 1n
    const decoded = decodeFrame(
      encodeFrame(FRAME_PUSH, address(1), address(2), top, Uint8Array.of(1, 2)),
    )

    expect(decoded.type).toBe(FRAME_PUSH)
    expect(decoded.counter).toBe(top)
    expect([...decoded.to]).toEqual([...address(1)])
    expect([...decoded.body]).toEqual([1, 2])
    expect(encodeHeader(FRAME_SEALED, address(1), address(2), 5n)).toHaveLength(42)
  })

  it('короткий, переросший, чужая версия, чужой вид, кривой адрес - отказ', () => {
    const frame = encodeFrame(FRAME_SEALED, address(1), address(2), 1n, new Uint8Array(10))

    expect(() => decodeFrame(frame.subarray(0, 41))).toThrow(FrameError)
    expect(() => decodeFrame(frame, 50)).toThrow(FrameError)
    expect(() => decodeFrame(Uint8Array.of(2, ...frame.subarray(1)))).toThrow(FrameError)
    expect(() => decodeFrame(Uint8Array.of(1, 9, ...frame.subarray(2)))).toThrow(FrameError)
    expect(() => encodeFrame(FRAME_SEALED, new Uint8Array(3), address(2), 1n, frame)).toThrow(
      FrameError,
    )
    expect(() => encodeFrame(FRAME_SEALED, address(1), address(2), -1n, frame)).toThrow(FrameError)
  })

  it('адрес - 22 знака base64url туда и обратно', () => {
    const text = encodeAddress(address(0xfb))

    expect(text).toHaveLength(22)
    expect([...decodeAddress(text)]).toEqual([...address(0xfb)])
    expect(() => decodeAddress('short')).toThrow(FrameError)
    expect(() => decodeAddress('A'.repeat(21) + '+')).toThrow(FrameError)
  })
})

describe('base64 без Buffer', () => {
  it('совпадает с Buffer на любых длинах', () => {
    for (let length = 0; length < 40; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 0xff)

      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
      expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
      expect([...(fromBase64(toBase64(bytes)) ?? [])]).toEqual([...bytes])
      expect([...(fromBase64Url(toBase64Url(bytes)) ?? [])]).toEqual([...bytes])
    }
  })

  it('чужой знак - null', () => {
    expect(fromBase64('ab$c')).toBeNull()
    expect(fromBase64Url('ab+c')).toBeNull()
  })
})

describe('метки и входы шифрования', () => {
  it('метки - свои, aw/v1, а не acc/v1 amazing-claude-code', () => {
    for (const label of Object.values(HKDF_INFO)) expect(label.startsWith('aw/v1/')).toBe(true)
  })

  it('вход HMAC - поля через нулевой байт, nonce - префикс и счётчик', () => {
    expect([...macInput(['a', 'bc'])]).toEqual([97, 0, 98, 99, 0])
    expect([...nonceOf(Uint8Array.of(1, 2, 3, 4), 0x0105n)]).toEqual([
      1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 1, 5,
    ])
    expect(sessionSaltText('a', 'd', 'x', 'y')).toBe('a|d|x|y')
  })

  it('отпечаток - четыре группы по четыре знака заглавными', () => {
    expect(fingerprintOf(Uint8Array.from({ length: 32 }, (_, index) => index * 17))).toBe(
      '0011 2233 4455 6677',
    )
  })
})

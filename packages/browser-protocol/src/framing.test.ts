import { it, expect, describe } from 'vitest'

import { FrameError, encodeFrame, FrameDecoder } from './framing'
import { encodeLine, LineSplitter, LineTooLongError } from './lines'

const BIG = 20 * 1024 * 1024
const CHUNK = 64 * 1024
/** Линейный сборщик укладывается в десятки миллисекунд; квадратичный - в секунду и больше. */
const LINEAR_MS = 400

describe('кадры native messaging', () => {
  it('длина - 4 байта little endian, дальше JSON в UTF-8', () => {
    const frame = encodeFrame({ text: 'ё' })
    const body = JSON.stringify({ text: 'ё' })

    expect(new DataView(frame.buffer).getUint32(0, true)).toBe(
      new TextEncoder().encode(body).length,
    )
    expect(new TextDecoder().decode(frame.subarray(4))).toBe(body)
  })

  it('собирает кадры из кусков и два кадра из одного куска', () => {
    const decoder = new FrameDecoder()
    const one = encodeFrame({ n: 1 })
    const two = encodeFrame({ n: 2, s: 'привет' })
    const joined = new Uint8Array([...one, ...two])

    expect(decoder.push(joined.subarray(0, 2))).toEqual([])
    expect(decoder.push(joined.subarray(2, one.length + 3))).toEqual([{ n: 1 }])
    expect(decoder.push(joined.subarray(one.length + 3))).toEqual([{ n: 2, s: 'привет' }])
  })

  it('кадр больше предела и не JSON - сбой потока', () => {
    expect(() => new FrameDecoder(10).push(encodeFrame({ long: 'x'.repeat(20) }))).toThrow(
      FrameError,
    )

    const broken = new Uint8Array([3, 0, 0, 0, 0x7b, 0x7b, 0x7b])

    expect(() => new FrameDecoder().push(broken)).toThrow(FrameError)
  })

  it('кадр по байту и кадры подряд - тот же результат', () => {
    const decoder = new FrameDecoder()
    const joined = new Uint8Array([...encodeFrame({ a: 1 }), ...encodeFrame([2, 3])])
    const messages = [...joined].flatMap((byte) => decoder.push(new Uint8Array([byte])))

    expect(messages).toEqual([{ a: 1 }, [2, 3]])
  })

  it('20 МБ кусками по 64 КБ - за линейное время, а не за квадрат', () => {
    const frame = encodeFrame({ data: 'x'.repeat(BIG) })
    const decoder = new FrameDecoder()
    const started = performance.now()
    const messages: unknown[] = []

    for (let offset = 0; offset < frame.length; offset += CHUNK) {
      messages.push(...decoder.push(frame.subarray(offset, offset + CHUNK)))
    }

    // Склейка всего накопленного на каждом куске - полторы секунды на 20 МБ; линейный
    // сборщик - десятки миллисекунд.
    expect(performance.now() - started).toBeLessThan(LINEAR_MS)
    expect(messages).toHaveLength(1)
  })
})

describe('JSON-строки сокета', () => {
  it('режет по переводу строки и ждёт хвост', () => {
    const splitter = new LineSplitter()
    const text = encodeLine({ a: 1 }) + encodeLine({ b: 'x\ny' })

    expect(splitter.push(text.slice(0, 5))).toEqual([])
    expect(splitter.push(text.slice(5)).map((line) => JSON.parse(line) as unknown)).toEqual([
      { a: 1 },
      { b: 'x\ny' },
    ])
  })

  it('слишком длинная строка - сбой', () => {
    expect(() => new LineSplitter(4).push('123456')).toThrow(LineTooLongError)
    expect(new LineSplitter(4).push('1234\n567')).toEqual(['1234'])
  })

  it('несколько строк в куске и строка через много кусков', () => {
    const splitter = new LineSplitter()

    expect(splitter.push('a')).toEqual([])
    expect(splitter.push('b')).toEqual([])
    expect(splitter.push('c\nd\n\ne')).toEqual(['abc', 'd'])
    expect(splitter.push('f\n')).toEqual(['ef'])
  })

  it('20 МБ кусками по 64 КБ - за линейное время, а не за квадрат', () => {
    const line = encodeLine({ data: 'x'.repeat(BIG) })
    const splitter = new LineSplitter()
    const started = performance.now()
    const lines: string[] = []

    for (let offset = 0; offset < line.length; offset += CHUNK) {
      lines.push(...splitter.push(line.slice(offset, offset + CHUNK)))
    }

    expect(performance.now() - started).toBeLessThan(LINEAR_MS)
    expect(lines).toHaveLength(1)
  })
})

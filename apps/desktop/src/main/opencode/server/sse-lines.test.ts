import { it, expect, describe } from 'vitest'

import { SseLines } from './sse-lines'

describe('поток событий SSE', () => {
  it('событие - по пустой строке, куски склеиваются, служебное пропускается', () => {
    const lines = new SseLines()

    expect(lines.push(': ping\n\nevent: x\ndata: {"a"')).toEqual([])
    expect(lines.push(':1}\r\n\r\ndata: one\ndata: two\n')).toEqual(['{"a":1}'])
    expect(lines.push('\n')).toEqual(['one\ntwo'])
  })
})

import { it, expect, describe } from 'vitest'

import { lastPage, pageAnchor, pageBefore } from './transcript-pages'

const line = (value: Record<string, unknown>) => JSON.stringify(value)
const prompt = (uuid: string) => line({ type: 'user', uuid, message: { content: uuid } })
const reply = (uuid: string) => line({ type: 'assistant', uuid, message: { id: uuid } })
const result = (uuid: string) =>
  line({ type: 'user', uuid, message: { content: [{ type: 'tool_result', tool_use_id: 't' }] } })
const snapshot = line({ type: 'file-history-snapshot', messageId: 'x' })

/** Ходы: сообщение, ответ с вызовом, результат, итоговый ответ. */
const turns = (count: number) =>
  Array.from({ length: count }, (_, index) => [
    snapshot,
    prompt(`u${index}`),
    reply(`a${index}`),
    result(`r${index}`),
    reply(`b${index}`),
  ]).flat()

const uuids = (lines: readonly string[]) =>
  lines.map((item) => (JSON.parse(item) as { uuid?: string }).uuid ?? '-')

describe('страницы транскрипта', () => {
  it('последняя страница начинается с сообщения человека и знает, что выше есть ещё', () => {
    const page = lastPage(turns(5), 6, true)

    expect(uuids(page.lines)).toEqual(['u3', 'a3', 'r3', 'b3', '-', 'u4', 'a4', 'r4', 'b4'])
    expect(page.hasEarlier).toBe(true)
  })

  it('весь разговор влез - выше ничего; хвост неполного файла - выше есть', () => {
    expect(lastPage(turns(2), 60, true).hasEarlier).toBe(false)
    expect(lastPage(turns(2), 60, false).hasEarlier).toBe(true)
  })

  it('страница выше кончается перед якорем, а следующая - перед её началом', () => {
    const lines = turns(5)
    const first = pageBefore(lines, 'u3', 4)

    expect(uuids(first?.lines ?? [])).toEqual(['u2', 'a2', 'r2', 'b2', '-'])
    expect(pageAnchor(first?.lines ?? [])).toBe('u2')

    const top = pageBefore(lines, 'u1', 40)

    expect(uuids(top?.lines ?? [])).toEqual(['-', 'u0', 'a0', 'r0', 'b0', '-'])
    expect(top?.hasEarlier).toBe(false)
  })

  it('страница до строки выше обычной тянется к началу её хода, а ниже якоря - не тянется', () => {
    const lines = turns(5)
    const deep = pageBefore(lines, 'u4', 4, uuids(lines).indexOf('b1'))

    expect(uuids(deep?.lines ?? [])).toEqual([
      ...['u1', 'a1', 'r1', 'b1', '-'],
      ...['u2', 'a2', 'r2', 'b2', '-'],
      ...['u3', 'a3', 'r3', 'b3', '-'],
    ])
    expect(deep?.hasEarlier).toBe(true)
    expect(pageBefore(lines, 'u4', 4, uuids(lines).indexOf('b4'))).toEqual(
      pageBefore(lines, 'u4', 4),
    )
  })

  it('якоря нет (отрезан откатом) - null', () => {
    expect(pageBefore(turns(2), 'gone', 30)).toBeNull()
  })

  it('страница шагает к началу хода, а за пределом шага - режет перед результатом', () => {
    const run = (count: number) =>
      Array.from({ length: count }, (_, index) => [reply(`a${index}`), result(`r${index}`)]).flat()

    expect(uuids(lastPage([prompt('u0'), ...run(10)], 3, true).lines)[0]).toBe('u0')
    expect(uuids(lastPage([prompt('u0'), ...run(300)], 3, true).lines)[0]).toMatch(/^r/)
  })
})

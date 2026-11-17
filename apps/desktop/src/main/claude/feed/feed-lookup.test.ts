import { it, expect, describe } from 'vitest'

import { parseCliLine } from '../cli/cli-messages'
import { FeedBuilder } from './feed-builder'
import { sourceLineOf, itemsFromLines } from './feed-lookup'

const at = (second: number) => `2026-11-15T10:00:${String(second).padStart(2, '0')}.000Z`
const line = (value: Record<string, unknown>) => JSON.stringify(value)

const prompt = (uuid: string, parentUuid: string | null, text: string, second: number) =>
  line({ type: 'user', uuid, parentUuid, timestamp: at(second), message: { content: text } })

const block = (uuid: string, parentUuid: string, id: string, content: unknown, second: number) =>
  line({
    type: 'assistant',
    uuid,
    parentUuid,
    timestamp: at(second),
    message: { id, role: 'assistant', model: 'claude-opus-4-5', content: [content] },
  })

/** Два хода: ответ из трёх строк (мысль, текст, вызов), результат, написанное посреди хода. */
const transcript = [
  prompt('u1', null, 'first question', 1),
  block('a1', 'u1', 'msg_A', { type: 'thinking', thinking: 'hmm' }, 2),
  block('a2', 'a1', 'msg_A', { type: 'text', text: 'Answer A' }, 3),
  block('a3', 'a2', 'msg_A', { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} }, 4),
  line({
    type: 'user',
    uuid: 'r1',
    parentUuid: 'a3',
    timestamp: at(5),
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
  }),
  line({
    type: 'attachment',
    uuid: 'q1',
    parentUuid: 'r1',
    timestamp: at(6),
    attachment: {
      type: 'queued_command',
      commandMode: 'prompt',
      source_uuid: 's1',
      prompt: 'and this',
    },
  }),
  prompt('u2', 'q1', 'second question', 7),
  block('b1', 'u2', 'msg_B', { type: 'text', text: 'Answer B' }, 8),
]

/** Та же лента, разобранная целиком, - эталон: найденное по id должно с ней совпасть. */
const replayed = () => {
  const builder = new FeedBuilder()

  for (const text of transcript) {
    const message = parseCliLine(text)

    if (message) builder.apply(message, true)
  }

  builder.finishReplay()

  return builder.items
}

describe('элементы ленты по id из транскрипта', () => {
  it('находит ответ, сообщение и написанное посреди хода - такими же, как в ленте', () => {
    const ids = ['u2', 'msg_A:1', 's1']
    const found = itemsFromLines(transcript, ids)
    const full = replayed().filter((item) => ids.includes(item.id))

    expect(found.map((item) => item.id)).toEqual(['msg_A:1', 's1', 'u2'])
    expect(found).toEqual(full)
    expect(found[0]).toMatchObject({ kind: 'assistant', text: 'Answer A' })
  })

  it('чего в транскрипте нет, того нет и в ответе', () => {
    expect(itemsFromLines(transcript, ['msg_A:9', 'gone'])).toEqual([])
  })

  it('строка-источник - своя, а не та, что ссылается на неё родителем', () => {
    expect(sourceLineOf(transcript, 'u2')).toBe(6)
    expect(sourceLineOf(transcript, 'msg_A:1')).toBe(1)
    expect(sourceLineOf(transcript, 's1')).toBe(5)
    expect(sourceLineOf([prompt('u3', 'nobody', 'x', 9)], 'nobody')).toBe(-1)
  })
})

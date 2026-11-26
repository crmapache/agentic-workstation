import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import { itemFacts, inputsText, holdCarriesOn } from './QueueScreen.utils'

const t = ((key: string, options?: { code?: string }) =>
  `${key}:${options?.code ?? ''}`) as unknown as TFunction

describe('элемент очереди строкой', () => {
  it('ответы одной строкой без пустых, длинное - с многоточием', () => {
    expect(inputsText({ what: 'src\n  auth', depth: '', more: '2' })).toBe(
      'what: src auth, more: 2',
    )
    expect(inputsText({ what: 'x'.repeat(200) }, 20)).toBe(`what: ${'x'.repeat(14)}…`)
  })

  it('ответы и отказ - через « · », без ответов и отказа - пусто', () => {
    const item = { inputs: { what: 'src' }, refusal: 'noCli' } as unknown as QueueItemWire

    expect(itemFacts(t, item)).toBe('what: src · queue.refused:noCli')
    expect(itemFacts(t, { inputs: {}, refusal: null } as unknown as QueueItemWire)).toBe('')
  })
})

describe('кнопка остановленной очереди', () => {
  const item = (id: string, state: QueueItemWire['state']) => ({ id, state }) as QueueItemWire
  const queue = (items: QueueItemWire[], itemId: string | null) =>
    ({ items, hold: itemId ? { reason: 'failed', itemId, at: 1 } : null }) as QueueWire

  it('несделанный перед ждущими - продолжить его прогон', () => {
    expect(holdCarriesOn(queue([item('a', 'stopped'), item('b', 'waiting')], 'a'))).toBe(true)
    expect(holdCarriesOn(queue([item('a', 'failed'), item('b', 'waiting')], 'a'))).toBe(true)
  })

  it('сделанный, без ждущих или без остановки - Resume', () => {
    expect(holdCarriesOn(queue([item('a', 'done'), item('b', 'waiting')], 'a'))).toBe(false)
    expect(holdCarriesOn(queue([item('a', 'stopped')], 'a'))).toBe(false)
    expect(holdCarriesOn(queue([item('a', 'stopped'), item('b', 'waiting')], null))).toBe(false)
  })
})

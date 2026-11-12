import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import { itemFacts, inputsText } from './QueueScreen.utils'

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
    const item = { inputs: { what: 'src' }, refusal: 'untrusted' } as unknown as QueueItemWire

    expect(itemFacts(t, item)).toBe('what: src · queue.refused:untrusted')
    expect(itemFacts(t, { inputs: {}, refusal: null } as unknown as QueueItemWire)).toBe('')
  })
})

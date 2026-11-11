import { it, expect, describe } from 'vitest'

import { seenRunState, conversationBadge } from './status.constants'

describe('значки состояний', () => {
  it('свободный разговор говорит, чем кончился ход: остановлен, ошибка, поломка', () => {
    expect(conversationBadge({ status: 'idle', outcome: 'interrupted' })).toEqual({
      tone: 'neutral',
      key: 'outcome.interrupted',
    })
    expect(conversationBadge({ status: 'idle', outcome: 'failed' }).key).toBe('outcome.failed')
    expect(conversationBadge({ status: 'idle', outcome: 'crashed' }).tone).toBe('danger')
    expect(conversationBadge({ status: 'idle', outcome: 'done' }).key).toBe('status.idle')
    // Идущий - своим состоянием, прошлый исход ему не важен.
    expect(conversationBadge({ status: 'running', outcome: 'failed' }).key).toBe('status.running')
  })

  it('кнопка прогона несёт состояние, для которого нарисована', () => {
    expect(seenRunState('paused')).toBe('paused')
    expect(seenRunState('blocked')).toBe('blocked')
    expect(seenRunState('something-new')).toBe('running')
  })
})

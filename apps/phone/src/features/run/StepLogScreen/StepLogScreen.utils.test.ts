import { it, expect, describe } from 'vitest'

import { logView } from './StepLogScreen.utils'

describe('журнал шага лентой', () => {
  it('страницы по порядку, повтор на стыке - один раз, «выше есть ещё» - у верхней', () => {
    const view = logView('build:card:1', [
      { found: true, items: [{ id: 'a', kind: 'user' }], hasEarlier: true },
      {
        found: true,
        items: [
          { id: 'a', kind: 'user' },
          { id: 'b', kind: 'assistant' },
        ],
        hasEarlier: true,
      },
    ])

    expect(view.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(view.hasEarlier).toBe(true)
    expect(view.conversationId).toBe('build:card:1')
    expect(logView('head', []).hasEarlier).toBe(false)
  })
})

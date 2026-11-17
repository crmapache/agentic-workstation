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
    expect(view.steps).toBeUndefined()
    expect(logView('head', []).hasEarlier).toBe(false)
  })

  it('счёт шагов субагентов - со всех страниц: у каждой свои вызовы', () => {
    const view = logView('head', [
      {
        found: true,
        items: [{ id: 'old-agent', kind: 'tool' }],
        steps: { 'old-agent': 7 },
        hasEarlier: false,
      },
      {
        found: true,
        items: [{ id: 'agent', kind: 'tool' }],
        steps: { agent: 400 },
        hasEarlier: true,
      },
    ])

    expect(view.steps).toEqual({ 'old-agent': 7, agent: 400 })
  })
})

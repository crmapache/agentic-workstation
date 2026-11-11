import { it, expect, describe } from 'vitest'

import { SOUND_GAP_MS } from './sounds.constants'
import { isWatched, passesGap, soundRank } from './sounds.utils'

describe('звуки подряд', () => {
  const after = (event: Parameters<typeof soundRank>[0]) => ({ at: 1000, rank: soundRank(event) })

  it('в окне молчит не важнее предыдущего, важнее - слышен', () => {
    expect(passesGap(after('turnDone'), 'turnDone', 1100)).toBe(false)
    expect(passesGap(after('error'), 'question', 1100)).toBe(false)
    expect(passesGap(after('turnDone'), 'error', 1100)).toBe(true)
  })

  it('после окна - любой', () => {
    expect(passesGap(after('error'), 'turnDone', 1000 + SOUND_GAP_MS)).toBe(true)
    expect(passesGap(null, 'turnDone', 0)).toBe(true)
  })
})

describe('смотрит ли человек на вкладку', () => {
  const call = { conversationId: 'c1', reason: 'turnDone' as const }
  const view = { activeConversationId: 'c1', panelShown: true, windowFocused: true }

  it('открытая вкладка в окне впереди - звать незачем', () => {
    expect(isWatched(call, view)).toBe(true)
  })

  it('фоновая вкладка, окно сзади, панель закрыта - звук нужен', () => {
    expect(isWatched(call, { ...view, activeConversationId: 'c2' })).toBe(false)
    expect(isWatched(call, { ...view, windowFocused: false })).toBe(false)
    expect(isWatched(call, { ...view, panelShown: false })).toBe(false)
  })
})

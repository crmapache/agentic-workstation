import { it, expect, describe } from 'vitest'

import type { ProviderId } from '@shared/providers'

import type { PanelsPort, ConversationsPort } from './bridge-ports'
import { UsageRefresh, PHONE_USAGE_REFRESH_MS } from './usage-refresh'

const panels = (asked: ProviderId[]): PanelsPort => ({
  refresh: () => Promise.resolve(null),
  saveFile: () => Promise.resolve(null),
  list: () =>
    (['claude', 'codex'] as const).map(
      (provider) =>
        ({
          provider,
          refreshUsage: () => {
            asked.push(provider)

            return Promise.resolve(null)
          },
        }) as unknown as ConversationsPort,
    ),
})

describe('лимиты провайдеров, которые смотрит телефон', () => {
  it('освежает каждого провайдера раз в шаг, а только что открытый - сразу', () => {
    const asked: ProviderId[] = []
    const refresh = new UsageRefresh(panels(asked))

    refresh.ask(['codex', 'codex', 'claude'], 1_000)
    refresh.ask(['codex'], 1_000 + PHONE_USAGE_REFRESH_MS - 1)
    refresh.ask(['claude'], 2_000, true)
    refresh.ask(['codex'], 1_000 + PHONE_USAGE_REFRESH_MS)

    expect(asked).toEqual(['codex', 'claude', 'claude', 'codex'])
  })

  it('провайдера без панели не спрашивает и не падает', () => {
    const asked: ProviderId[] = []

    new UsageRefresh(panels(asked)).ask(['kimi'], 1_000)

    expect(asked).toEqual([])
  })
})

import { it, expect, describe } from 'vitest'

import type { ProviderModel } from '@shared/providers'

import { MAIN_MODELS } from './EditorModal.constants'
import { modelMenu } from './EditorModal.utils'

const model = (value: string, custom = false, description = ''): ProviderModel => ({
  value,
  displayName: value.toUpperCase(),
  description,
  custom,
})

describe('меню MODEL из моделей провайдера', () => {
  it('без «по умолчанию»: основные сразу, старые версии - группой, свои - следом', () => {
    const catalog = ['default', 'fable', 'opus', 'sonnet', 'haiku', 'opus-4', 'sonnet-4']
    const menu = modelMenu([
      ...catalog.map((value) => model(value, false, value === 'opus' ? 'Deep work' : '')),
      model('gateway-model', true),
    ])

    expect(menu.main.map((option) => option.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    expect(menu.main).toHaveLength(MAIN_MODELS)
    expect(menu.main[1]).toEqual({ id: 'opus', label: 'OPUS', description: 'Deep work' })
    expect(menu.main[0]?.description).toBeUndefined()
    expect(menu.older.map((option) => option.id)).toEqual(['opus-4', 'sonnet-4'])
    expect(menu.custom).toEqual([{ id: 'gateway-model', label: 'GATEWAY-MODEL' }])
  })

  it('моделей нет (провайдер ещё не ответил) - пустое меню, а не выдуманные', () => {
    expect(modelMenu([])).toEqual({ main: [], older: [], custom: [] })
  })
})

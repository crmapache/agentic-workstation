import { it, expect, describe } from 'vitest'

import { modelLabel, pickableModels } from './models.utils'
import { FALLBACK_MODELS } from './ComposerStatus/ComposerStatus.constants'

const catalog = [
  { value: 'default', displayName: 'Default', description: '' },
  { value: 'opus', displayName: 'Opus', description: 'Best' },
]

describe('модели для меню', () => {
  it('без «по умолчанию», свои - в конце и с пометкой, повтор каталога не дублируется', () => {
    const models = pickableModels(catalog, ['proxy/fast', 'opus'])

    expect(models.map((model) => [model.value, model.custom])).toEqual([
      ['opus', false],
      ['proxy/fast', true],
    ])
  })

  it('пока каталога нет - запасной список провайдера; у кого его нет - пусто', () => {
    expect(pickableModels([], [], FALLBACK_MODELS).length).toBeGreaterThan(0)
    expect(pickableModels([], [])).toEqual([])
  })

  it('подпись - из каталога, своя модель - своим именем', () => {
    const models = pickableModels(catalog, ['proxy/fast'])

    expect(modelLabel('opus', models)).toBe('Opus')
    expect(modelLabel('proxy/fast', models)).toBe('proxy/fast')
  })

  it('основные - сильнейшая первой, старые версии - за ними в порядке CLI', () => {
    const models = pickableModels(
      [
        { value: 'opus', displayName: 'Opus', description: '' },
        { value: 'fable', displayName: 'Fable', description: '' },
        { value: 'sonnet', displayName: 'Sonnet', description: '' },
        { value: 'haiku', displayName: 'Haiku', description: '' },
        { value: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5', description: '' },
        { value: 'claude-opus-4-1', displayName: 'Opus 4.1', description: '' },
      ],
      [],
    )

    expect(models.map((model) => model.value)).toEqual([
      'fable',
      'opus',
      'sonnet',
      'haiku',
      'claude-sonnet-4-5',
      'claude-opus-4-1',
    ])
  })
})

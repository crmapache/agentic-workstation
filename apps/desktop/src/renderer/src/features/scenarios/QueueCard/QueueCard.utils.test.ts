import { it, expect, describe } from 'vitest'

import { modelName, runsOnChips } from './QueueCard.utils'

describe('what a queue item runs on', () => {
  it('folds the pairs into one chip per model, efforts in the order of the scale', () => {
    expect(
      runsOnChips([
        { model: 'opus', effort: 'high' },
        { model: 'opus', effort: 'xhigh' },
        { model: 'sonnet', effort: 'medium' },
        { model: 'opus', effort: 'medium' },
        { model: 'sonnet', effort: 'low' },
      ]),
    ).toEqual([
      { model: 'opus', efforts: ['medium', 'high', 'xhigh'] },
      { model: 'sonnet', efforts: ['low', 'medium'] },
    ])
  })

  it('names no effort the CLI picks itself', () => {
    expect(runsOnChips([{ model: '', effort: '' }])).toEqual([{ model: '', efforts: [] }])
  })

  it('names a model as the editor menu does, then by its id', () => {
    const models = [
      { value: 'opus[1m]', displayName: 'Opus (1M context)', description: '', custom: false },
    ]

    expect(modelName('opus[1m]', models)).toBe('Opus (1M context)')
    expect(modelName('claude-sonnet-5-5', models)).toBe('Sonnet 5.5')
    expect(modelName('gpt-5.5', models)).toBe('gpt-5.5')
  })
})

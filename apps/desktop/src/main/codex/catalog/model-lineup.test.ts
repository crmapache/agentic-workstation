import { it, expect, describe } from 'vitest'

import { lineupFirst } from './model-lineup'

const model = (value: string) => ({ value, displayName: value, description: '' })
const values = (ids: readonly string[]) => lineupFirst(ids.map(model)).map((item) => item.value)

describe('порядок моделей Codex в меню', () => {
  it('линейка - новейшая модель каждого уровня, сильнейшая первой; старое - за ней в порядке Codex', () => {
    // Порядок каталога Codex 0.163: первой модель по умолчанию, старые поколения вперемешку.
    expect(
      values([
        'gpt-6.1-terra',
        'gpt-6.1-sol',
        'gpt-6-astra',
        'gpt-6-sol',
        'gpt-6-luna',
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
      ]),
    ).toEqual([
      'gpt-6-astra',
      'gpt-6.1-sol',
      'gpt-6.1-terra',
      'gpt-6-luna',
      'gpt-6-sol',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ])
  })

  it('новейшая в уровне - по поколению, а не по месту в каталоге', () => {
    expect(values(['gpt-5.6-sol', 'gpt-6-sol', 'gpt-6.1-sol'])).toEqual([
      'gpt-6.1-sol',
      'gpt-5.6-sol',
      'gpt-6-sol',
    ])
  })

  it('незнакомые имена не ранжируются: без уровней - порядок Codex как есть', () => {
    expect(values(['gpt-5.5-codex', 'o3', 'gpt-5.5-sol'])).toEqual([
      'gpt-5.5-sol',
      'gpt-5.5-codex',
      'o3',
    ])
    expect(values(['gpt-5.5-codex', 'o3'])).toEqual(['gpt-5.5-codex', 'o3'])
  })
})

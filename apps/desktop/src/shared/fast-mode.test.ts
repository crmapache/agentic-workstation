import { it, expect, describe } from 'vitest'

import type { ModelInfo } from './conversation'
import { fastModeShown, modelHasFastMode, isFastModeChecked } from './fast-mode'

const CODEX_MODELS: ModelInfo[] = [
  { value: 'gpt-a', displayName: 'A', description: '', isDefault: true, fast: true },
  { value: 'gpt-b', displayName: 'B', description: '', isDefault: false, fast: false },
]

describe('быстрый режим: просьба и ответ вместе', () => {
  it('не просили, а CLI сказал «работает» - включён его настройками; выключили здесь - выключен', () => {
    const on = { state: 'on' as const, reason: '' }

    expect(fastModeShown(undefined, on)).toEqual({ kind: 'on', fromSettings: true })
    expect(isFastModeChecked(undefined, on)).toBe(true)
    expect(fastModeShown(false, undefined)).toEqual({ kind: 'off' })
    expect(isFastModeChecked(false, undefined)).toBe(false)
    expect(isFastModeChecked(true, undefined)).toBe(true)
  })

  it('«по умолчанию» без своей строки в каталоге - модель каталога по умолчанию', () => {
    expect(modelHasFastMode(CODEX_MODELS, null)).toBe(true)
    expect(modelHasFastMode(CODEX_MODELS, 'gpt-b')).toBe(false)
  })
})

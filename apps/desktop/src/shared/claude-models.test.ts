import { it, expect, describe } from 'vitest'

import {
  bareModelId,
  modelLabelOf,
  modelFamilyOf,
  modelVersionOf,
  PANEL_MODEL_FAMILIES,
  CLAUDE_MODEL_FAMILIES,
} from './claude-models'

describe('modelFamilyOf', () => {
  it('семья по любому имени: выбор, развёрнутое, подпись ответа, старое', () => {
    expect(modelFamilyOf('opus', CLAUDE_MODEL_FAMILIES)).toBe('opus')
    expect(modelFamilyOf('Sonnet[1m]', CLAUDE_MODEL_FAMILIES)).toBe('sonnet')
    expect(modelFamilyOf('claude-sonnet-5-5', CLAUDE_MODEL_FAMILIES)).toBe('sonnet')
    expect(modelFamilyOf('claude-3-5-haiku-20241022', CLAUDE_MODEL_FAMILIES)).toBe('haiku')
    expect(modelFamilyOf('claude-mythos-5-1', CLAUDE_MODEL_FAMILIES)).toBe('mythos')
  })

  it('opusplan не путается с opus', () => {
    expect(modelFamilyOf('opusplan', CLAUDE_MODEL_FAMILIES)).toBe('opusplan')
  })

  it('чужая модель и семья вне списка вызывающего - без семьи', () => {
    expect(modelFamilyOf('gpt-proxy/x', CLAUDE_MODEL_FAMILIES)).toBeUndefined()
    expect(modelFamilyOf('<synthetic>', CLAUDE_MODEL_FAMILIES)).toBeUndefined()
    expect(modelFamilyOf('claude-mythos-5', PANEL_MODEL_FAMILIES)).toBeUndefined()
  })
})

describe('modelVersionOf и bareModelId', () => {
  it('поколение без даты сборки и метки окна', () => {
    expect(modelVersionOf('claude-opus-4-5-20251101')).toBe('4.5')
    expect(modelVersionOf('claude-3-5-haiku-20241022')).toBe('3.5')
    expect(modelVersionOf('claude-opus-5[1m]')).toBe('5')
    expect(modelVersionOf('opus')).toBe('')
    expect(bareModelId('Claude-Opus-5[1m]')).toBe('claude-opus-5')
  })
})

describe('modelLabelOf', () => {
  it('семья и поколение, «1M» у окна в миллион', () => {
    expect(modelLabelOf('claude-opus-4-5-20251101', 'opus')).toBe('Opus 4.5')
    expect(modelLabelOf('claude-sonnet-4-20250514', 'sonnet')).toBe('Sonnet 4')
    expect(modelLabelOf('claude-3-5-haiku-20241022', 'haiku')).toBe('Haiku 3.5')
    expect(modelLabelOf('claude-opus-5[1m]', 'opus')).toBe('Opus 5 1M')
    expect(modelLabelOf('opus', 'opus')).toBe('Opus')
  })

  it('без семьи - идентификатор как есть', () => {
    expect(modelLabelOf('<synthetic>', undefined)).toBe('<synthetic>')
    expect(modelLabelOf('gpt-proxy/x', undefined)).toBe('gpt-proxy/x')
  })
})

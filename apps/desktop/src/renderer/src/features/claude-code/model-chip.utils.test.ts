import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/claude'

import { modelChip, modelFamily, modelCaption } from './model-chip.utils'
import type { PickableModel } from './models.types'

/** Переводчик-эхо: ключ и параметры - по ним и проверяем. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction

const MODELS: PickableModel[] = [
  {
    value: 'opus[1m]',
    displayName: 'Opus (1M context)',
    description: '',
    custom: false,
    resolved: 'claude-opus-5-5[1m]',
  },
]

const conversation = (change: Partial<Conversation>): Conversation =>
  ({ id: 'c', model: 'opus[1m]', activeModel: 'claude-opus-5-5', ...change }) as Conversation

describe('чип MODEL', () => {
  it('семья модели по идентификатору: opusplan не путается с opus, своя - без семьи', () => {
    expect(modelFamily('claude-opus-4-8')).toBe('opus')
    expect(modelFamily('opusplan')).toBe('opusplan')
    expect(modelFamily('Sonnet[1m]')).toBe('sonnet')
    expect(modelFamily('gpt-proxy/x')).toBeUndefined()
  })

  it('имя для людей из идентификатора', () => {
    expect(modelCaption('claude-opus-4-8', [])).toBe('Opus 4.8')
    expect(modelCaption('claude-haiku-4-5-20251001', [])).toBe('Haiku 4.5')
    expect(modelCaption('claude-opus-5[1m]', [])).toBe('Opus 5 1M')
    expect(modelCaption('claude-3-5-haiku-20241022', [])).toBe('Haiku 3.5')
    expect(modelCaption('gpt-proxy/x', [])).toBe('gpt-proxy/x')
  })

  it('семья, которой нет в панели, называется полным идентификатором', () => {
    expect(modelFamily('claude-mythos-5')).toBeUndefined()
    expect(modelCaption('claude-mythos-5', [])).toBe('claude-mythos-5')
  })

  it('держит выбор «1M», пока ничего не случилось', () => {
    const chip = modelChip(conversation({}), MODELS, t)

    expect(chip.label).toBe('Opus (1M context)')
    expect(chip.warning).toBe(false)
    expect(chip.fast).toBeNull()
  })

  it('выбор не доехал - работающая модель жёлтым, подсказка называет выбранную', () => {
    const chip = modelChip(
      conversation({ model: 'fable', modelNote: { kind: 'stuck', picked: 'fable' } }),
      MODELS,
      t,
    )

    expect(chip.label).toBe('Opus 5.5')
    expect(chip.warning).toBe(true)
    expect(chip.hint).toContain('claudeCode.modelNote.stuckHint')
  })

  it('быстрый режим: просьба без ответа CLI - знак ждёт', () => {
    expect(modelChip(conversation({ fastMode: true }), MODELS, t).fast).toBe('dim')
    expect(
      modelChip(
        conversation({ fastMode: true, fastReport: { state: 'on', reason: '' } }),
        MODELS,
        t,
      ).fast,
    ).toBe('on')
  })
})

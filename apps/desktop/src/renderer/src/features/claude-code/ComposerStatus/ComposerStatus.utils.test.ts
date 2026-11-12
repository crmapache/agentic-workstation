import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/claude'

import { MODEL_ICONS, OTHER_MODEL_ICON } from './ComposerStatus.constants'
import { modelIcon, setupValue, nextSection, stepAfterPick } from './ComposerStatus.utils'

/** Переводчик-эхо: ключ и параметры - по ним и проверяем. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction

const conversation = (change: Partial<Conversation>): Conversation =>
  ({ id: 'c', model: null, effort: null, permissionMode: 'auto', ...change }) as Conversation

const chip = { label: 'claudeCode.model.default', warning: false, hint: 'model', fast: null }

describe('индикатор модели, усилия и режима', () => {
  it('стрелки ходят по разделам по кругу', () => {
    expect(nextSection('model', 1)).toBe('effort')
    expect(nextSection('mode', 1)).toBe('model')
    expect(nextSection('model', -1)).toBe('mode')
  })

  it('шагами от открытия выбор ведёт дальше: модель, усилие, режим - и закрыть', () => {
    expect(stepAfterPick({ section: 'model', guided: true })).toBe('effort')
    expect(stepAfterPick({ section: 'effort', guided: true })).toBe('mode')
    expect(stepAfterPick({ section: 'mode', guided: true })).toBeNull()
  })

  it('раздел, открытый вкладкой или стрелкой, закрывается первым же выбором', () => {
    expect(stepAfterPick({ section: 'model', guided: false })).toBeNull()
    expect(stepAfterPick({ section: 'effort', guided: false })).toBeNull()
  })

  it('«по умолчанию» называется с тем, что по умолчанию', () => {
    const value = setupValue(conversation({}), chip, t)

    expect(value.model).toBe('claudeCode.status.defaultModel')
    expect(value.effort).toBe('claudeCode.effort.default')
    expect(value.mode).toBe('claudeCode.modes.short.auto')
  })

  it('на индикаторе коротко, для скринридера и в подсказке - полными словами', () => {
    const value = setupValue(
      conversation({ effort: 'medium', permissionMode: 'bypassPermissions' }),
      { ...chip, label: 'Haiku 5.5' },
      t,
    )

    expect(value.effort).toBe('claudeCode.effort.levels.medium')
    expect(value.mode).toBe('claudeCode.modes.short.bypassPermissions')
    expect(value.label).toContain(
      'claudeCode.status.effortValue {"value":"claudeCode.effort.levels.medium"}',
    )
    expect(value.label).toContain('claudeCode.modes.labels.bypassPermissions')
    expect(value.hint).toContain('claudeCode.modes.labels.bypassPermissions')
  })

  it('выбранное - своими словами, модель не та - как её назвал чип', () => {
    const value = setupValue(
      conversation({ model: 'opus', effort: 'high' }),
      { ...chip, label: 'Opus 5.5' },
      t,
    )
    const swapped = setupValue(conversation({}), { ...chip, label: 'Sonnet', warning: true }, t)

    expect(value.model).toBe('Opus 5.5')
    expect(value.effort).toBe('claudeCode.effort.levels.high')
    expect(swapped.model).toBe('Sonnet')
  })

  it('иконка модели - по семье, у старых версий та же, у своей модели - общая', () => {
    expect(modelIcon('opus')).toBe(MODEL_ICONS.opus)
    expect(modelIcon('claude-opus-4-1-20250805')).toBe(MODEL_ICONS.opus)
    expect(modelIcon('opusplan')).toBe(MODEL_ICONS.opusplan)
    expect(modelIcon('sonnet[1m]')).toBe(MODEL_ICONS.sonnet)
    expect(modelIcon('gpt-proxy/x')).toBe(OTHER_MODEL_ICON)
  })
})

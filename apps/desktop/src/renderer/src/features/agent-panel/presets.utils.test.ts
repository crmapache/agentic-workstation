import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { SetupPreset } from '@shared/panel-prefs'
import { shownPresets, DEFAULT_PANEL_PREFS } from '@shared/panel-prefs'

import type { PickableModel } from './models.types'
import { presetsFor, withPreset, activePreset, presetOptions, presetSummary } from './presets.utils'

const fast: SetupPreset = { name: 'Fast', model: 'sonnet', effort: 'low', mode: 'acceptEdits' }
const deep: SetupPreset = { name: 'Deep', model: 'opus', effort: 'max', mode: 'bypassPermissions' }
const plan: SetupPreset = { name: 'Plan', model: 'opus', effort: 'max', mode: 'plan' }

const setupOf = (preset: SetupPreset) => ({
  model: preset.model,
  effort: preset.effort,
  permissionMode: preset.mode,
})

describe('пресеты под полем (ADR 0096)', () => {
  it('кнопками стоят первые presetCount, остальные хранятся', () => {
    const prefs = { ...DEFAULT_PANEL_PREFS, presetCount: 1, presets: [fast, deep] }

    expect(shownPresets(prefs)).toEqual([fast])
    expect(shownPresets({ ...prefs, presetCount: 0 })).toEqual([])
  })

  it('горит пресет с моделью и усилием разговора; режим в счёт не идёт', () => {
    const presets = [fast, deep]

    expect(activePreset(presets, setupOf(deep))).toBe(1)
    // Shift+Tab в план после нажатия - кнопка не гаснет.
    expect(activePreset(presets, { ...setupOf(deep), permissionMode: 'plan' })).toBe(1)
    // Модель или усилие сменили руками мимо пресетов - не горит ни одна.
    expect(activePreset(presets, { ...setupOf(deep), effort: 'high' })).toBe(-1)
    expect(activePreset(presets, { ...setupOf(fast), model: 'haiku' })).toBe(-1)
    // Руками пришли ровно к другому пресету - горит он.
    expect(activePreset(presets, { ...setupOf(fast), permissionMode: 'default' })).toBe(0)
  })

  it('двое с той же моделью и усилием - горит тот, у кого совпал и режим, иначе первый', () => {
    const presets = [deep, plan]

    expect(activePreset(presets, setupOf(plan))).toBe(1)
    expect(activePreset(presets, setupOf(deep))).toBe(0)
    expect(activePreset(presets, { ...setupOf(plan), permissionMode: 'default' })).toBe(0)
  })

  it('«по умолчанию» - тоже значение: null совпадает только с null', () => {
    const plain: SetupPreset = { name: 'Plain', model: null, effort: null, mode: 'default' }

    expect(activePreset([plain], { model: null, effort: null, permissionMode: 'plan' })).toBe(0)
    expect(activePreset([plain], { model: 'opus', effort: null, permissionMode: 'default' })).toBe(
      -1,
    )
  })

  it('пресет меняет только отличающееся, недоступный режим не просит', () => {
    expect(presetOptions(deep, setupOf(fast), false)).toEqual({
      model: 'opus',
      effort: 'max',
      permissionMode: 'bypassPermissions',
    })
    expect(presetOptions(deep, { ...setupOf(fast), model: 'opus' }, false)).toEqual({
      effort: 'max',
      permissionMode: 'bypassPermissions',
    })
    expect(presetOptions(deep, setupOf(fast), true)).toEqual({ model: 'opus', effort: 'max' })
    expect(presetOptions(deep, setupOf(deep), false)).toBeNull()
    expect(presetOptions(deep, { ...setupOf(deep), permissionMode: 'plan' }, false)).toEqual({
      permissionMode: 'bypassPermissions',
    })
  })

  it('новые кнопки - с вкладки сейчас и с именем номера, старые остаются', () => {
    const named = (number: number) => `Preset ${number}`

    expect(presetsFor([fast], 3, setupOf(deep), named)).toEqual([
      fast,
      { ...deep, name: 'Preset 2' },
      { ...deep, name: 'Preset 3' },
    ])
    expect(presetsFor([fast, deep], 1, null, named)).toEqual([fast, deep])
    expect(presetsFor([], 1, null, named)).toEqual([
      { name: 'Preset 1', model: null, effort: null, mode: 'default' },
    ])
  })

  it('правка одного пресета не трогает соседей', () => {
    expect(withPreset([fast, deep], 1, { name: 'Max' })).toEqual([fast, { ...deep, name: 'Max' }])
  })

  it('подпись пресета - модель из меню, усилие и режим словами', () => {
    const t = ((key: string, options?: { value?: string }) =>
      options?.value ? `${key}(${options.value})` : key) as unknown as TFunction
    const models = [{ value: 'opus', displayName: 'Opus 5.5' }] as PickableModel[]

    expect(presetSummary(deep, models, t)).toBe(
      'Opus 5.5 · agentPanel.status.effortValue(agentPanel.effort.levels.max) · agentPanel.modes.labels.bypassPermissions',
    )
    expect(presetSummary({ ...deep, model: null, effort: null }, models, t, true)).toBe(
      'agentPanel.status.defaultModel · agentPanel.effort.default · agentPanel.modes.short.bypassPermissions',
    )
  })
})

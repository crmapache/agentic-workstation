import { it, expect, describe } from 'vitest'

import type { ProviderCaps, ProviderPreset } from '@agentic-workstation/remote-protocol/wire-types'

import { AS_IN_IDE } from './NewConversationScreen.constants'
import {
  withModel,
  activePreset,
  presetChoice,
  newConversationArgs,
} from './NewConversationScreen.utils'

const claude: ProviderCaps = {
  id: 'claude',
  label: 'Claude Code',
  available: true,
  models: [
    { value: 'opus', label: 'Opus 5.5', description: '' },
    { value: 'haiku', label: 'Haiku 5.5', description: '', efforts: ['low', 'medium'] },
  ],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  permissionModes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
}

const strong: ProviderPreset = {
  name: 'Strong',
  model: 'opus',
  effort: 'xhigh',
  mode: 'bypassPermissions',
}
const plan: ProviderPreset = { name: 'Plan', model: 'opus', effort: 'xhigh', mode: 'plan' }
const plain: ProviderPreset = { name: 'Plain', model: null, effort: null, mode: 'acceptEdits' }

describe('пресеты нового разговора на телефоне (ADR 0096)', () => {
  it('горит пресет с выбранными моделью и усилием; режим только выбирает из двух равных', () => {
    const presets = [strong, plan, plain]
    const opusXhigh = { model: 'opus', effort: 'xhigh' }

    expect(activePreset(presets, { ...opusXhigh, mode: 'bypassPermissions' })).toBe(0)
    expect(activePreset(presets, { ...opusXhigh, mode: 'plan' })).toBe(1)
    // Режим ушёл от обоих - горит первый из равных.
    expect(activePreset(presets, { ...opusXhigh, mode: 'default' })).toBe(0)
    expect(activePreset(presets, { model: null, effort: null, mode: '' })).toBe(2)
  })

  it('«как в IDE» не совпадает ни с одним: что за ним стоит, знает только IDE', () => {
    expect(activePreset([strong, plain], AS_IN_IDE)).toBe(-1)
    expect(activePreset([], AS_IN_IDE)).toBe(-1)
  })

  it('нажатие ставит модель, усилие и режим пресета, «по умолчанию» - null, а не «как в IDE»', () => {
    expect(presetChoice(strong, AS_IN_IDE, claude)).toEqual({
      model: 'opus',
      effort: 'xhigh',
      mode: 'bypassPermissions',
    })
    expect(presetChoice(plain, AS_IN_IDE, claude)).toEqual({
      model: null,
      effort: null,
      mode: 'acceptEdits',
    })
  })

  it('режим, в котором разговор проекта не начнётся, не ставится - остаётся прежний', () => {
    const before = { ...AS_IN_IDE, mode: 'plan' }

    expect(presetChoice(strong, before, claude, ['bypassPermissions'])).toEqual({
      model: 'opus',
      effort: 'xhigh',
      mode: 'plan',
    })

    const codex = { ...claude, id: 'codex', permissionModes: ['default', 'readOnly'] }

    expect(presetChoice(strong, AS_IN_IDE, codex).mode).toBe('')
  })

  it('другая модель снимает усилие, которого у неё нет; «по умолчанию» остаётся', () => {
    const chosen = presetChoice(strong, AS_IN_IDE, claude)

    expect(withModel(claude, chosen, 'haiku')).toEqual({ ...chosen, model: 'haiku', effort: '' })
    expect(withModel(claude, { ...chosen, effort: null }, 'haiku').effort).toBeNull()
    expect(withModel(claude, chosen, '').effort).toBe('xhigh')
  })

  it('команда: «как в IDE» не шлётся, «по умолчанию» пресета уходит null', () => {
    expect(newConversationArgs('p-x', 'claude', AS_IN_IDE)).toEqual({
      projectKey: 'p-x',
      provider: 'claude',
    })
    expect(newConversationArgs('p-x', 'claude', presetChoice(plain, AS_IN_IDE, claude))).toEqual({
      projectKey: 'p-x',
      provider: 'claude',
      model: null,
      effort: null,
      permissionMode: 'acceptEdits',
    })
    expect(newConversationArgs('p-x', 'claude', presetChoice(strong, AS_IN_IDE, claude))).toEqual({
      projectKey: 'p-x',
      provider: 'claude',
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'bypassPermissions',
    })
  })
})

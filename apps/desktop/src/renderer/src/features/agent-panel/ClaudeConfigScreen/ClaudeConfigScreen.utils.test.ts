import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ClaudeConfigSetting } from '@shared/claude-config'

import { isSwitch, settingNote, nextFailures } from './ClaudeConfigScreen.utils'

const t = ((key: string) => key) as unknown as TFunction

const setting = (fields: Partial<ClaudeConfigSetting>): ClaudeConfigSetting => ({
  key: 'verbose',
  options: ['true', 'false'],
  free: false,
  value: 'false',
  group: 'terminal',
  lockedBy: null,
  projectOnly: false,
  ...fields,
})

describe('ряды настроек Claude Code', () => {
  it('переключатель - только ровно вкл/выкл', () => {
    expect(isSwitch(setting({}))).toBe(true)
    expect(isSwitch(setting({ options: ['true', 'false', 'default'] }))).toBe(false)
  })

  it('пояснение: сохраняю, блокировка, «решает CLI», чипы, только этот проект', () => {
    expect(settingNote(setting({}), 'verbose', t)).toBe('agentPanel.claudeConfig.saving')
    expect(settingNote(setting({ lockedBy: 'policy' }), null, t)).toBe(
      'agentPanel.claudeConfig.locked.policy',
    )
    expect(settingNote(setting({ key: 'model', value: null }), null, t)).toBe(
      'agentPanel.claudeConfig.notSet agentPanel.claudeConfig.chips',
    )
    expect(settingNote(setting({ projectOnly: true }), null, t)).toBe(
      'agentPanel.claudeConfig.projectOnly',
    )
    expect(settingNote(setting({}), null, t)).toBeUndefined()
  })

  it('отказ - словами CLI, принятая правка снимает только свой', () => {
    const failed = nextFailures(
      { tips: 'old' },
      'theme',
      { key: 'theme', ok: false, message: 'No' },
      'x',
    )

    expect(failed).toEqual({ tips: 'old', theme: 'No' })
    expect(nextFailures(failed, 'theme', { key: 'theme', ok: true, message: '' }, 'x')).toEqual({
      tips: 'old',
    })
    expect(nextFailures({}, 'theme', null, 'fallback')).toEqual({ theme: 'fallback' })
  })
})

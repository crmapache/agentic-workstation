import { it, vi, expect, describe } from 'vitest'

import type { RefusedModes } from '@shared/conversation'
import { CODEX_CAPABILITIES, CLAUDE_CAPABILITIES } from '@shared/panel-capabilities'

import { PROJECT_PATH, conversationOf } from '../__fixtures__/fake-ide'
import type { ModePanel } from './mode-gate'
import { ModeGate, MODES_FRESH_MS } from './mode-gate'

/**
 * Ворота на подделке: Claude Code со слоями настроек и Codex без них; что лежит в настройках,
 * отказы CLI и часы - руками теста.
 */
const gateOf = () => {
  const files = { bypassDisabled: false, fails: false }
  const refused: RefusedModes = { bypass: false, autoModels: [] }
  const clock = { now: 1_000 }
  const read = vi.fn((_projectPath: string) =>
    files.fails ? Promise.reject(new Error('EACCES')) : Promise.resolve(files.bypassDisabled),
  )
  const panels: Record<string, ModePanel> = {
    claude: { modes: CLAUDE_CAPABILITIES.modes, refused, read },
    codex: {
      modes: CODEX_CAPABILITIES.modes,
      refused: { bypass: false, autoModels: [] },
      read: null,
    },
  }
  const changed = vi.fn()
  const gate = new ModeGate({
    panel: (provider) => panels[provider] ?? null,
    providers: () => Object.keys(panels),
    changed,
    now: () => clock.now,
  })

  return { gate, files, refused, clock, read, changed }
}

describe('режимы для телефона - правило окна', () => {
  it('не прочитанные настройки гасят bypass, прочитанные - уже нет, и телефону - новое', async () => {
    const { gate, read, changed } = gateOf()

    expect(gate.offForNew('claude', PROJECT_PATH)).toEqual(['bypassPermissions'])
    await gate.ready([PROJECT_PATH])

    expect(gate.offForNew('claude', PROJECT_PATH)).toEqual([])
    expect(read).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('разговору гасится то же, что меню MODE: bypass по настройкам, auto - по его модели', async () => {
    const { gate, files, refused } = gateOf()
    const opus = conversationOf({ model: 'opus' })

    files.bypassDisabled = true
    refused.autoModels = ['opus']
    await gate.ready([PROJECT_PATH])

    expect(gate.offFor('claude', opus)).toEqual(['auto', 'bypassPermissions'])
    expect(gate.offFor('claude', conversationOf({ model: 'sonnet' }))).toEqual([
      'bypassPermissions',
    ])
    // Новый разговор - как меню New chats: auto без разговора не гасится.
    expect(gate.offForNew('claude', PROJECT_PATH)).toEqual(['bypassPermissions'])
  })

  it('отказ CLI на bypass гасит его и там, где настройки его разрешают', async () => {
    const { gate, refused } = gateOf()

    refused.bypass = true

    expect(await gate.allows('claude', 'bypassPermissions', PROJECT_PATH, null)).toBe(false)
    expect(await gate.allows('claude', 'plan', PROJECT_PATH, null)).toBe(true)
  })

  it('команда читает настройки заново, список - не чаще срока свежести', async () => {
    const { gate, files, clock, read, changed } = gateOf()

    await gate.ready([PROJECT_PATH])
    files.bypassDisabled = true
    gate.offForNew('claude', PROJECT_PATH)
    expect(read).toHaveBeenCalledTimes(1)

    // Команда не верит прочитанному полминуты назад.
    expect(await gate.allows('claude', 'bypassPermissions', PROJECT_PATH, null)).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenCalledTimes(2)

    // Старое прочитанное список перечитывает сам, в фоне.
    files.bypassDisabled = false
    clock.now += MODES_FRESH_MS + 1
    expect(gate.offForNew('claude', PROJECT_PATH)).toEqual(['bypassPermissions'])
    await gate.allows('claude', 'plan', PROJECT_PATH, null)
    expect(gate.offForNew('claude', PROJECT_PATH)).toEqual([])
  })

  it('чтение одно на проект за раз; не прочиталось - прежнее значение и без перемен', async () => {
    const { gate, files, clock, read, changed } = gateOf()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await Promise.all([
      gate.ready([PROJECT_PATH]),
      gate.allows('claude', 'plan', PROJECT_PATH, null),
    ])
    expect(read).toHaveBeenCalledTimes(1)

    files.fails = true
    clock.now += MODES_FRESH_MS + 1
    expect(await gate.allows('claude', 'bypassPermissions', PROJECT_PATH, null)).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('режимы своего провайдера (ADR 0083)', () => {
  it('у Codex - его режимы: readOnly есть, auto нет; слоёв настроек нет - bypass не гасится', async () => {
    const { gate, files, read } = gateOf()

    files.bypassDisabled = true
    await gate.ready([PROJECT_PATH])

    expect(gate.offForNew('codex', PROJECT_PATH)).toEqual([])
    expect(await gate.allows('codex', 'readOnly', PROJECT_PATH, null)).toBe(true)
    expect(await gate.allows('codex', 'bypassPermissions', PROJECT_PATH, null)).toBe(true)
    expect(await gate.allows('codex', 'auto', PROJECT_PATH, null)).toBe(false)
    // Запрет в настройках Claude Code его и гасит, а читаются они один раз - для Claude.
    expect(await gate.allows('claude', 'bypassPermissions', PROJECT_PATH, null)).toBe(false)
    expect(read.mock.calls.every(([path]) => path === PROJECT_PATH)).toBe(true)
  })

  it('режим не своего провайдера и провайдер, которого нет, - недоступны', async () => {
    const { gate } = gateOf()

    expect(await gate.allows('claude', 'readOnly', PROJECT_PATH, null)).toBe(false)
    expect(await gate.allows('gemini', 'default', PROJECT_PATH, null)).toBe(false)
    expect(gate.offForNew('gemini', PROJECT_PATH)).toEqual([])
  })
})

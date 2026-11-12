import { it, expect, describe } from 'vitest'

import { DEFAULT_PANEL_PREFS } from '@shared/claude-prefs'

import { applyPrefsPatch, parsePanelPrefs } from './panel-prefs'

describe('настройки панели', () => {
  it('битое и чужое с диска - по умолчанию, поле за полем', () => {
    expect(parsePanelPrefs(null)).toEqual(DEFAULT_PANEL_PREFS)
    expect(parsePanelPrefs({ gaugeVivid: 'calm', shareEditor: false })).toEqual({
      ...DEFAULT_PANEL_PREFS,
      shareEditor: false,
    })
  })

  it('убранные настройки из старой записи отбрасываются молча', () => {
    const stored = {
      sendKey: 'modEnter',
      spellcheck: false,
      textSize: 15,
      restoreTabs: false,
      composerLayout: 'compact',
      hiddenIndicators: ['ringContext'],
      settingSources: { '/p': 'user' },
      pasteCollapse: 5,
    }

    expect(parsePanelPrefs(stored)).toEqual({ ...DEFAULT_PANEL_PREFS, pasteCollapse: 5 })
  })

  it('числа прижимаются к пределам', () => {
    const prefs = parsePanelPrefs({ gaugeVivid: -5, pasteCollapse: 3.4 })

    expect(prefs.gaugeVivid).toBe(0)
    expect(prefs.pasteCollapse).toBe(3)
    expect(parsePanelPrefs({ gaugeVivid: 140 }).gaugeVivid).toBe(100)
  })

  it('своя модель - только имя, годное для аргумента запуска', () => {
    const prefs = parsePanelPrefs({
      customModels: ['gpt-proxy/opus', 'bad name', 'a"b', 'gpt-proxy/opus'],
    })

    expect(prefs.customModels).toEqual(['gpt-proxy/opus'])
  })

  it('спрятанные показания - строки одной строкой, без повторов', () => {
    const prefs = parsePanelPrefs({
      hiddenMeters: ['session', 'weekly:Fable', 'session', 7, 'a\nb', ''],
    })

    expect(prefs.hiddenMeters).toEqual(['session', 'weekly:Fable'])
    expect(parsePanelPrefs({ hiddenMeters: 'session' }).hiddenMeters).toEqual([])
    expect(applyPrefsPatch(prefs, { hiddenMeters: [] }).hiddenMeters).toEqual([])
  })

  it('путь к CLI - пусто или абсолютный путь одной строкой', () => {
    expect(parsePanelPrefs({ cliPath: ' /opt/claude/bin/claude ' }).cliPath).toBe(
      '/opt/claude/bin/claude',
    )
    expect(parsePanelPrefs({ cliPath: 'claude' }).cliPath).toBe('')
    expect(parsePanelPrefs({ cliPath: '/a\n/b' }).cliPath).toBe('')
    expect(applyPrefsPatch(DEFAULT_PANEL_PREFS, { cliPath: '' }).cliPath).toBe('')
  })

  it('патч меняет только названное', () => {
    const next = applyPrefsPatch(DEFAULT_PANEL_PREFS, { shareEditor: false, newTabModel: null })

    expect(next).toEqual({ ...DEFAULT_PANEL_PREFS, shareEditor: false })
  })

  it('негодное поле в патче - отказ, а не тихий пропуск', () => {
    expect(() => applyPrefsPatch(DEFAULT_PANEL_PREFS, { gaugeVivid: 'calm' })).toThrow()
    expect(() => applyPrefsPatch(DEFAULT_PANEL_PREFS, { unknown: true })).toThrow()
    // Убранная настройка - тоже чужое поле: окно не должно думать, что она встала.
    expect(() => applyPrefsPatch(DEFAULT_PANEL_PREFS, { sendKey: 'modEnter' })).toThrow()
  })

  it('имя модели с дефиса - не модель: CLI прочёл бы его флагом', () => {
    expect(parsePanelPrefs({ customModels: ['--help', 'proxy/opus'] }).customModels).toEqual([
      'proxy/opus',
    ])
  })

  it('удалённая своя модель снимается и с новых вкладок', () => {
    const prefs = { ...DEFAULT_PANEL_PREFS, customModels: ['a', 'b'], newTabModel: 'a' }

    expect(applyPrefsPatch(prefs, { customModels: ['b'] }).newTabModel).toBeNull()
    expect(
      applyPrefsPatch({ ...prefs, newTabModel: 'opus' }, { customModels: [] }).newTabModel,
    ).toBe('opus')
  })
})

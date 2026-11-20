import { it, expect, describe } from 'vitest'

import type { SetupPreset } from '@shared/panel-prefs'
import { DEFAULT_PANEL_PREFS } from '@shared/panel-prefs'

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
      // Сворачивание вставки - общая настройка IDE (shared/ide-prefs.ts): из панели уехало.
      pasteCollapse: 5,
    }

    expect(parsePanelPrefs(stored)).toEqual(DEFAULT_PANEL_PREFS)
  })

  it('числа прижимаются к пределам', () => {
    const prefs = parsePanelPrefs({ gaugeVivid: -5 })

    expect(prefs.gaugeVivid).toBe(0)
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

  describe('пресеты под полем (ADR 0096)', () => {
    const fast: SetupPreset = { name: 'Fast', model: 'sonnet', effort: 'low', mode: 'acceptEdits' }
    const deep: SetupPreset = {
      name: 'Deep',
      model: 'opus',
      effort: 'max',
      mode: 'bypassPermissions',
    }

    it('с диска - годные по порядку, негодный снимает только себя', () => {
      const prefs = parsePanelPrefs({
        presetCount: 3,
        presets: [fast, { ...deep, effort: 'ultra' }, { ...deep, name: ' Deep ' }],
      })

      expect(prefs.presets).toEqual([fast, deep])
      // Кнопок не больше, чем пресетов: третья ничего бы не ставила.
      expect(prefs.presetCount).toBe(2)
    })

    it('имя - короткая строка, модель и усилие - пусто или годное значение', () => {
      const presets = parsePanelPrefs({
        presets: [
          { ...fast, name: '' },
          { ...fast, name: 'a\nb' },
          { ...fast, name: 'x'.repeat(17) },
          { ...fast, model: '--help' },
          { ...fast, mode: 'yolo' },
          { name: 'Default', model: null, effort: null, mode: 'default' },
        ],
      }).presets

      expect(presets).toEqual([{ name: 'Default', model: null, effort: null, mode: 'default' }])
    })

    it('не больше трёх, число кнопок - от нуля до трёх', () => {
      const prefs = parsePanelPrefs({ presetCount: 9, presets: [fast, deep, fast, deep] })

      expect(prefs.presets).toHaveLength(3)
      expect(prefs.presetCount).toBe(3)
      expect(parsePanelPrefs({ presetCount: -1, presets: [fast] }).presetCount).toBe(0)
    })

    it('уровни и режимы - провайдера панели', () => {
      const rules = { efforts: ['low', 'high'] as const, modes: ['default', 'plan'] as const }
      const prefs = parsePanelPrefs(
        { presets: [{ ...fast, mode: 'plan' }, deep, { ...fast, effort: 'medium' }] },
        rules,
      )

      expect(prefs.presets).toEqual([{ ...fast, mode: 'plan' }])
    })

    it('негодный пресет в патче - отказ всего поля, а не тихая потеря кнопки', () => {
      expect(() =>
        applyPrefsPatch(DEFAULT_PANEL_PREFS, { presets: [fast, { ...deep, name: '' }] }),
      ).toThrow()
      expect(() =>
        applyPrefsPatch(DEFAULT_PANEL_PREFS, { presets: [fast, deep, fast, deep] }),
      ).toThrow()

      const next = applyPrefsPatch(DEFAULT_PANEL_PREFS, { presetCount: 2, presets: [fast, deep] })

      expect(next.presets).toEqual([fast, deep])
      expect(next.presetCount).toBe(2)
    })

    it('спрятанные кнопкой пресеты хранятся: число вернулось - пресет тот же', () => {
      const prefs = applyPrefsPatch(DEFAULT_PANEL_PREFS, { presetCount: 2, presets: [fast, deep] })
      const hidden = applyPrefsPatch(prefs, { presetCount: 0 })

      expect(hidden.presets).toEqual([fast, deep])
      expect(applyPrefsPatch(hidden, { presetCount: 2 }).presetCount).toBe(2)
    })

    it('удалённая своя модель снимается и с пресетов', () => {
      const prefs = {
        ...DEFAULT_PANEL_PREFS,
        customModels: ['proxy/opus'],
        presetCount: 1,
        presets: [{ ...deep, model: 'proxy/opus' }],
      }

      expect(applyPrefsPatch(prefs, { customModels: [] }).presets[0]?.model).toBeNull()
    })
  })
})

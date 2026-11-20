import { it, expect, describe } from 'vitest'

import { parseIdePrefs, legacyIdePrefs, DEFAULT_IDE_PREFS } from './ide-prefs'

describe('общие настройки IDE', () => {
  it('негодное поле остаётся прежним, годное встаёт', () => {
    const base = { ...DEFAULT_IDE_PREFS, pasteCollapse: 7 }

    expect(parseIdePrefs({ pasteCollapse: -1, commitAi: 'x' }, base)).toEqual(base)
    expect(parseIdePrefs({ pasteCollapse: 5000 }).pasteCollapse).toBe(1000)
    expect(parseIdePrefs({ pasteCollapse: 0 }).pasteCollapse).toBe(0)
  })

  it('цепочка коммита: только провайдеры для работы без человека, не длиннее четырёх', () => {
    const chain = parseIdePrefs({
      commitAi: [
        { provider: 'antigravity', model: 'x', effort: 'low' },
        { provider: 'codex', model: 'gpt-5.5', effort: 'high' },
        { provider: 'claude', model: 'bad name!', effort: 'nope' },
        { provider: 'kimi' },
        { provider: 'opencode' },
        { provider: 'claude' },
      ],
    }).commitAi

    expect(chain).toEqual([
      { provider: 'codex', model: 'gpt-5.5', effort: 'high' },
      { provider: 'claude', model: '', effort: '' },
      { provider: 'kimi', model: '', effort: '' },
      { provider: 'opencode', model: '', effort: '' },
    ])
    expect(parseIdePrefs({ commitAi: [] }).commitAi).toEqual(DEFAULT_IDE_PREFS.commitAi)
  })

  it('сворачивание вставки переезжает из настроек панели Claude Code', () => {
    expect(legacyIdePrefs({ prefs: { pasteCollapse: 12 } })).toEqual({ pasteCollapse: 12 })
    expect(legacyIdePrefs({ prefs: {} })).toBeNull()
    expect(legacyIdePrefs(null)).toBeNull()
  })
})

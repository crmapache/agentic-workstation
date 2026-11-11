import { it, expect, describe } from 'vitest'

import { parseSoundPrefs, legacySoundPrefs } from './sound-prefs'

describe('настройка звуков', () => {
  it('чужое и негодное отбрасывается по одному', () => {
    expect(
      parseSoundPrefs({
        muted: ['turnDone', 'nope', 'turnDone', 3],
        volumes: { error: 140, plan: 12.6, question: 'loud', other: 20 },
      }),
    ).toEqual({ muted: ['turnDone'], volumes: { error: 100, plan: 13 } })
    expect(parseSoundPrefs(null)).toEqual({ muted: [], volumes: {} })
  })

  it('из настроек панели Claude Code переносится один раз, если там что-то было', () => {
    expect(
      legacySoundPrefs({
        prefs: { mutedSounds: ['plan'], soundVolumes: { turnDone: 10 }, shareEditor: true },
      }),
    ).toEqual({ muted: ['plan'], volumes: { turnDone: 10 } })
    expect(legacySoundPrefs({ prefs: { shareEditor: true } })).toBeNull()
    expect(legacySoundPrefs(null)).toBeNull()
  })
})

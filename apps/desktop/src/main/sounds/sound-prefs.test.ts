import { it, expect, describe } from 'vitest'

import { parseSoundPrefs, legacySoundPrefs } from './sound-prefs'

describe('настройка звуков', () => {
  it('чужое и негодное отбрасывается по одному', () => {
    expect(
      parseSoundPrefs({
        muteAll: 'yes',
        muted: ['turnDone', 'nope', 'turnDone', 3],
        volumes: { error: 140, plan: 12.6, question: 'loud', other: 20 },
      }),
    ).toEqual({ muteAll: false, muted: ['turnDone'], volumes: { error: 100, plan: 13 } })
    expect(parseSoundPrefs(null)).toEqual({ muteAll: false, muted: [], volumes: {} })
    expect(parseSoundPrefs({ muteAll: true })).toEqual({ muteAll: true, muted: [], volumes: {} })
  })

  it('из настроек панели Claude Code переносится один раз, если там что-то было', () => {
    expect(
      legacySoundPrefs({
        prefs: { mutedSounds: ['plan'], soundVolumes: { turnDone: 10 }, shareEditor: true },
      }),
    ).toEqual({ muteAll: false, muted: ['plan'], volumes: { turnDone: 10 } })
    expect(legacySoundPrefs({ prefs: { shareEditor: true } })).toBeNull()
    expect(legacySoundPrefs(null)).toBeNull()
  })
})

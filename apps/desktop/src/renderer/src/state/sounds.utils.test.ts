import { it, expect, describe } from 'vitest'

import type { SoundPrefs } from '@shared/sounds'
import { DEFAULT_SOUND_VOLUME } from '@shared/sounds'

import { volumeOf, isAudible, toggleSound, setSoundVolume } from './sounds.utils'

const none: SoundPrefs = { muteAll: false, muted: [], volumes: {} }

describe('галочка и громкость звука', () => {
  it('выключенный помнит громкость и включается на ней', () => {
    const quiet = setSoundVolume(none, 'plan', 30)
    const off = toggleSound(quiet, 'plan')
    const back = toggleSound(off, 'plan')

    expect(off.muted).toEqual(['plan'])
    expect(volumeOf(back, 'plan')).toBe(30)
    expect(back.muted).toEqual([])
  })

  it('ползунок в ноль выключает, а включённый обратно галочкой - не тишина', () => {
    const silent = setSoundVolume(none, 'error', 0)
    const back = toggleSound(silent, 'error')

    expect(silent.muted).toEqual(['error'])
    expect(volumeOf(back, 'error')).toBe(DEFAULT_SOUND_VOLUME)
  })

  it('поднятый ползунок включает выключенный звук', () => {
    const off = toggleSound(none, 'question')

    expect(setSoundVolume(off, 'question', 40).muted).toEqual([])
  })

  it('громкость по умолчанию не хранится, края прижимаются', () => {
    expect(setSoundVolume(none, 'plan', DEFAULT_SOUND_VOLUME).volumes).toEqual({})
    expect(volumeOf(setSoundVolume(none, 'plan', 140), 'plan')).toBe(100)
  })

  it('все звуки разом молчат, а свои галочки и громкости помнят', () => {
    const quiet = setSoundVolume(none, 'plan', 30)
    const silent = { ...quiet, muteAll: true }

    expect(isAudible(silent, 'turnDone')).toBe(false)
    expect(toggleSound(silent, 'error').muteAll).toBe(true)
    expect(isAudible({ ...silent, muteAll: false }, 'turnDone')).toBe(true)
    expect(volumeOf({ ...silent, muteAll: false }, 'plan')).toBe(30)
  })
})

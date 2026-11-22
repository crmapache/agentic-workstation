import { it, expect, describe } from 'vitest'

import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import { languageName, toggleExpected, voicedLanguages } from './voice-settings.utils'

describe('voice settings', () => {
  it('names languages in English', () => {
    expect(languageName('ru')).toBe('Russian')
  })

  it('shows the voices of the chosen language or the expected ones', () => {
    expect(voicedLanguages({ ...DEFAULT_VOICE_SETTINGS, languageMode: 'es' })).toEqual(['es'])
    expect(voicedLanguages({ ...DEFAULT_VOICE_SETTINGS, expected: ['ru', 'en'] })).toEqual([
      'ru',
      'en',
    ])
    expect(voicedLanguages({ ...DEFAULT_VOICE_SETTINGS, expected: [] })).toHaveLength(10)
  })

  it('keeps the expected languages in list order', () => {
    expect(toggleExpected(['ru'], 'en', true)).toEqual(['en', 'ru'])
    expect(toggleExpected(['en', 'ru'], 'en', false)).toEqual(['ru'])
  })
})

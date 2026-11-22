import type { TFunction } from 'i18next'

import type { PermissionMode } from '@shared/conversation'
import type { VoiceLanguage, VoiceSettings } from '@shared/voice'
import { VOICE_BARGE_INS, VOICE_LANGUAGES } from '@shared/voice'
import { VOICE_CATALOG } from '@shared/voice-catalog'

import type { ChoiceOption } from '@agentic-workstation/ui/ChoiceField.types'

/** Имя языка по-английски («Russian»): интерфейс IDE английский. */
export const languageName = (language: VoiceLanguage): string =>
  new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language

/** Режимы разрешений голосового чата: без «всё разрешено» - распознавание иногда ошибается. */
const VOICE_MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'readOnly', 'plan']

export const languageModeChoices = (t: TFunction): ChoiceOption[] => [
  { value: 'multi', label: t('settings.voice.languageMulti') },
  ...VOICE_LANGUAGES.map((language) => ({ value: language, label: languageName(language) })),
]

export const voiceChoices = (language: VoiceLanguage): ChoiceOption[] =>
  VOICE_CATALOG[language].map((voice) => ({
    value: voice.model,
    label: voice.name,
    description: voice.gender ?? undefined,
  }))

export const bargeInChoices = (t: TFunction): ChoiceOption[] =>
  VOICE_BARGE_INS.map((level) => ({ value: level, label: t(`settings.voice.bargeIn_${level}`) }))

export const permissionChoices = (t: TFunction): ChoiceOption[] =>
  VOICE_MODES.map((mode) => ({ value: mode, label: t(`agentPanel.modes.labels.${mode}`) }))

export const regionChoices = (t: TFunction): ChoiceOption[] => [
  { value: 'global', label: t('settings.voice.region_global') },
  { value: 'eu', label: t('settings.voice.region_eu') },
]

/**
 * Языки, чьи голоса показать: выбранный язык - один; мультирежим - ожидаемые, а если их не
 * отметили - все десять.
 */
export const voicedLanguages = (settings: VoiceSettings): readonly VoiceLanguage[] => {
  if (settings.languageMode !== 'multi') return [settings.languageMode]

  return settings.expected.length > 0 ? settings.expected : VOICE_LANGUAGES
}

/** Отметить или снять ожидаемый язык, сохраняя порядок списка языков. */
export const toggleExpected = (
  expected: readonly VoiceLanguage[],
  language: VoiceLanguage,
  on: boolean,
): VoiceLanguage[] =>
  VOICE_LANGUAGES.filter((known) => (known === language ? on : expected.includes(known)))

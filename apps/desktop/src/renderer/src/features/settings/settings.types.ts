import type { VoiceLanguage } from '@shared/voice'

/** Разделы окна настроек IDE - пункты меню слева. */
export type SettingsSection = 'appearance' | 'chat' | 'sounds' | 'ai' | 'voice' | 'git' | 'calendar'

/** Единица напоминания о звонке в настройках: в календаре оно - минутами. */
export type ReminderUnit = 'minutes' | 'hours' | 'days'

/** Проба голоса языка в настройках: образец готовится или звучит. Одна проба за раз. */
export type VoicePreview = { language: VoiceLanguage; phase: 'loading' | 'playing' }

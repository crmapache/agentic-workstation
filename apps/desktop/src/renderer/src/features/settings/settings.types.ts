import type { VoiceLanguage } from '@shared/voice'

/** Разделы окна настроек IDE - пункты меню слева. */
export type SettingsSection = 'appearance' | 'chat' | 'sounds' | 'ai' | 'voice' | 'git'

/** Проба голоса языка в настройках: образец готовится или звучит. Одна проба за раз. */
export type VoicePreview = { language: VoiceLanguage; phase: 'loading' | 'playing' }

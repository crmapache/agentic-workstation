import { Volume2, AArrowUp, Settings, VolumeOff, AArrowDown, ALargeSmall } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMuteAllSounds } from '../../state/sounds.queries'
import { useTextSizeStore } from '../../state/text-size.store'
import type { SearchAction } from '../../features/search-everywhere/search-everywhere.types'
import { useSettingsStore } from '../../features/settings/settings.store'

/**
 * Настройки IDE и размер текста в поиске везде - те же команды, что в меню приложения
 * (⌘,, ⌘+, ⌘-, ⌘0), с теми же клавишами в подсказке. Слова «font» и «zoom» - потому что
 * так ищут размер текста по привычке из других программ. Все звуки разом - то же, что кнопка
 * в шапке окна.
 */
export const useSettingsActions = (): SearchAction[] => {
  const { t } = useTranslation()
  const openSettings = useSettingsStore((state) => state.open)
  const stepTextSize = useTextSizeStore((state) => state.stepTextSize)
  const resetTextSize = useTextSizeStore((state) => state.resetTextSize)
  const sounds = useMuteAllSounds()
  const textKeywords = ['font', 'zoom', 'scale', 'appearance']

  return [
    {
      id: 'ide.openSettings',
      label: t('searchEverywhere.actions.openSettings'),
      icon: Settings,
      shortcut: '⌘,',
      keywords: ['preferences', 'appearance', 'text size', 'font'],
      run: openSettings,
    },
    {
      id: 'ide.textSizeUp',
      label: t('searchEverywhere.actions.textSizeUp'),
      icon: AArrowUp,
      shortcut: '⌘+',
      keywords: [...textKeywords, 'bigger', 'larger'],
      run: () => stepTextSize(1),
    },
    {
      id: 'ide.textSizeDown',
      label: t('searchEverywhere.actions.textSizeDown'),
      icon: AArrowDown,
      shortcut: '⌘−',
      keywords: [...textKeywords, 'smaller'],
      run: () => stepTextSize(-1),
    },
    {
      id: 'ide.textSizeReset',
      label: t('searchEverywhere.actions.textSizeReset'),
      icon: ALargeSmall,
      shortcut: '⌘0',
      keywords: [...textKeywords, 'actual size', 'default'],
      run: resetTextSize,
    },
    {
      id: 'ide.muteAllSounds',
      label: sounds.muteAll
        ? t('searchEverywhere.actions.unmuteAllSounds')
        : t('searchEverywhere.actions.muteAllSounds'),
      icon: sounds.muteAll ? Volume2 : VolumeOff,
      keywords: ['sound', 'mute', 'unmute', 'silent', 'quiet', 'volume', 'audio'],
      run: sounds.toggle,
    },
  ]
}

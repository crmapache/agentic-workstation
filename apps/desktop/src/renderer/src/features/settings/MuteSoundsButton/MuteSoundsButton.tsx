import { Volume2, VolumeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useMuteAllSounds } from '../../../state/sounds.queries'

/**
 * Все звуки IDE одним нажатием - в строке состояния, рядом с телефоном Remote Control. Нажатая
 * (заливкой) - IDE молчит: разговоры зовут светом вкладки и точкой проекта, без звука. Поводы и
 * громкости - в Settings → Sounds, кнопка их не трогает.
 */
export const MuteSoundsButton = () => {
  const { t } = useTranslation()
  const { muteAll, toggle } = useMuteAllSounds()

  return (
    <IconButton
      icon={muteAll ? VolumeOff : Volume2}
      label={muteAll ? t('settings.sounds.unmuteAll') : t('settings.sounds.muteAll')}
      size="sm"
      active={muteAll}
      tooltipPlacement="top"
      onClick={toggle}
    />
  )
}

import { Square, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

/** Справа в шапке разговора: остановить ход (пока идёт) и настройки разговора. */
export const HeaderActions = ({
  running,
  stopping,
  onStop,
  onSettings,
}: {
  running: boolean
  stopping: boolean
  onStop: () => void
  onSettings: () => void
}) => {
  const { t } = useTranslation()

  return (
    <>
      {running && (
        <IconButton
          icon={Square}
          size="touch"
          label={t('conversation.stop')}
          disabled={stopping}
          onClick={onStop}
        />
      )}
      <IconButton
        icon={SlidersHorizontal}
        size="touch"
        label={t('conversation.settings.title')}
        onClick={onSettings}
      />
    </>
  )
}

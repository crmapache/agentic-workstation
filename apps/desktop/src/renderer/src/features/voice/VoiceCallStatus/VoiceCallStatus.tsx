import { PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useVoice, voiceCallActions } from '../../../state/voice.queries'
import { callStateText } from '../../../state/voice.utils'
import styles from './VoiceCallStatus.module.scss'

/**
 * Звонок в строке состояния, пока он идёт: откуда (панель или телефон), что сейчас (слушаю,
 * думаю, говорю) и кнопка положить трубку - видно с любого вида окна, а не только из Home.
 */
export const VoiceCallStatus = () => {
  const { t } = useTranslation()
  const call = useVoice()?.call

  if (!call) return null

  const handleEnd = () => void voiceCallActions(call.id).end()

  return (
    <span className={styles.status}>
      <Badge tone="accent">
        {t('voice.statusLine', {
          origin: t(`voice.origin.${call.origin}`),
          state: callStateText(t, call),
        })}
      </Badge>
      <IconButton
        icon={PhoneOff}
        label={t('voice.end')}
        size="sm"
        variant="danger"
        tooltipPlacement="top"
        onClick={handleEnd}
      />
    </span>
  )
}

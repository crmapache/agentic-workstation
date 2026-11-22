import { Mic, MicOff, Square, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { VoiceCallView } from '@shared/voice'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useVoiceCallActions } from '../../../state/voice.queries'
import { canStopCall, callStateText } from '../../../state/voice.utils'
import styles from './VoiceCallBar.module.scss'

/**
 * Полоса голосового звонка над полем его разговора (ADR 0104): что звонок делает, живой текст
 * реплики, пока человек говорит, и кнопки - микрофон (у звонка из панели), «Стоп» (агент
 * замолкает и останавливается; гаснет, пока звонок только слушает) и положить трубку. Звонок с
 * телефона виден и здесь.
 */
export const VoiceCallBar = ({ call }: { call: VoiceCallView }) => {
  const { t } = useTranslation()
  const actions = useVoiceCallActions(call.id)

  const handleMute = () => void actions.mute(!call.muted)
  const handleStop = () => void actions.stop()
  const handleEnd = () => void actions.end()

  return (
    <div className={styles.callBar}>
      <Badge tone={call.state === 'reconnecting' ? 'warning' : 'accent'}>
        {callStateText(t, call)}
      </Badge>
      <span className={styles.heard}>{call.heard}</span>
      {call.origin === 'desktop' && (
        <IconButton
          icon={call.muted ? MicOff : Mic}
          label={call.muted ? t('voice.unmute') : t('voice.mute')}
          size="sm"
          active={call.muted}
          onClick={handleMute}
        />
      )}
      <IconButton
        icon={Square}
        label={t('voice.stop')}
        size="sm"
        disabled={!canStopCall(call)}
        onClick={handleStop}
      />
      <IconButton
        icon={PhoneOff}
        label={t('voice.end')}
        size="sm"
        variant="danger"
        onClick={handleEnd}
      />
    </div>
  )
}

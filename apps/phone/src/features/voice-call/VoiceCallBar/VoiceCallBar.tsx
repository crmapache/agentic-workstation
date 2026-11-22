import { Mic, MicOff, Square, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { VoiceCallWire } from '@agentic-workstation/remote-protocol/agent-messages'
import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useVoiceCall } from '../voice-call.hooks'
import { callStateText } from '../voice-call.utils'
import { canStopCall } from '../../../state/voice-call.utils'
import styles from './VoiceCallBar.module.scss'

/**
 * Полоса голосового звонка над его разговором (ADR 0104): что звонок делает, живой текст реплики
 * и кнопки под пальцем - микрофон, «Стоп» (агент замолкает сразу и останавливается; гаснет, пока
 * звонок только слушает), положить трубку.
 * Звонок кончился - полосы нет, экран остаётся обычным чатом.
 */
export const VoiceCallBar = ({ agentId, call }: { agentId: string; call: VoiceCallWire }) => {
  const { t } = useTranslation()
  const { end, stop, mute } = useVoiceCall(agentId)

  return (
    <div className={styles.callBar}>
      <Badge tone={call.state === 'reconnecting' ? 'warning' : 'accent'}>
        {callStateText(t, call)}
      </Badge>
      <span className={styles.heard}>{call.heard}</span>
      <IconButton
        icon={call.muted ? MicOff : Mic}
        label={call.muted ? t('voice.unmute') : t('voice.mute')}
        size="touch"
        active={call.muted}
        onClick={() => mute(!call.muted)}
      />
      <IconButton
        icon={Square}
        label={t('voice.stop')}
        size="touch"
        disabled={!canStopCall(call.state)}
        onClick={stop}
      />
      <IconButton
        icon={PhoneOff}
        label={t('voice.end')}
        size="touch"
        variant="danger"
        onClick={end}
      />
    </div>
  )
}

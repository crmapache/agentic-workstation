import { Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useVoiceCall } from '../voice-call.hooks'
import { useRouter } from '../../../lib/router.store'
import type { MirroredInventory } from '../../../state/remote.types'
import { ListRow } from '../../../shell/ListRow/ListRow'
import styles from './VoiceCallRow.module.scss'

/**
 * Голосовой звонок с машины (ADR 0104): новый разговор в Home голосом. Звонок идёт - строка ведёт
 * к нему; голос недоступен - строка приглушена и говорит почему (включить и ключ - в настройках
 * IDE). IDE без голоса строки не показывает вовсе.
 */
export const VoiceCallRow = ({
  agentId,
  inventory,
}: {
  agentId: string
  inventory: MirroredInventory
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const { call, start } = useVoiceCall(agentId)
  const voice = inventory.voice

  if (!voice) return null

  const live = call?.phase === 'live' && call.call ? call.call : null
  const description = live
    ? t('voice.inCall')
    : voice.available
      ? t('voice.callHint')
      : t(`voice.unavailable.${voice.reason ?? 'off'}`)

  const handleClick = () => {
    if (live) {
      return navigate({
        name: 'conversation',
        agentId,
        projectKey: live.projectKey,
        conversationId: live.conversationId,
      })
    }

    if (voice.available) start()
  }

  return (
    <ListRow
      title={t('voice.call')}
      description={description}
      muted={!voice.available && !live}
      leading={<Mic className={styles.icon} aria-hidden />}
      trailing={
        call?.phase === 'starting' && (
          <Spinner size="sm" tone="accent" label={t('voice.starting')} />
        )
      }
      onClick={voice.available || live ? handleClick : undefined}
    />
  )
}

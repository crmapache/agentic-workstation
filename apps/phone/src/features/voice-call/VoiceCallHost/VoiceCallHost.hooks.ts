import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { VoiceEvent } from '@agentic-workstation/remote-protocol/agent-messages'

import { dropEngine, callEngines } from '../call-engines'
import { useClient } from '../../../lib/client'
import { useRouter } from '../../../lib/router.store'
import { useToastStore } from '../../../state/toast.store'
import { useVoiceCallStore } from '../../../state/voice-call.store'
import { CALM_ENDS } from './VoiceCallHost.constants'

/**
 * Слова звонка и звук ответа - движку звонка своей IDE. IDE подняла звонок - движок пошёл, а
 * телефон - к разговору звонка: экран звонка и есть экран этого чата с полосой звонка сверху.
 * Отказ или конец - звук гаснет, о необычном конце - строка внизу.
 */
export const useVoiceCallHost = () => {
  const { t } = useTranslation()
  const client = useClient()
  const navigate = useRouter((state) => state.navigate)
  const showToast = useToastStore((state) => state.show)

  useEffect(() => {
    const event = (agentId: string, voice: VoiceEvent) => {
      const engine = callEngines.get(agentId)
      const call = useVoiceCallStore.getState().calls[agentId]

      switch (voice.kind) {
        case 'started':
          if (voice.ref !== call?.ref) return

          engine?.attach(voice.call.callId)

          return navigate({
            name: 'conversation',
            agentId,
            projectKey: voice.call.projectKey,
            conversationId: voice.call.conversationId,
          })
        case 'refused':
          if (voice.ref !== call?.ref) return
          dropEngine(agentId)

          return showToast(
            t('voice.refused', {
              reason: t(`voice.reasons.${voice.reason}`, { defaultValue: voice.reason }),
            }),
          )
        case 'ended':
          dropEngine(agentId)

          return CALM_ENDS.includes(voice.reason)
            ? undefined
            : showToast(t(`voice.ended.${voice.reason}`, { defaultValue: t('voice.ended.other') }))
        default:
          return engine?.cue(voice)
      }
    }
    const offs = [
      client.events.on('message', (agentId, message) => {
        if (message.k === 'voice') event(agentId, message.event)
      }),
      client.events.on('audio', (agentId, frame) => callEngines.get(agentId)?.audio(frame)),
    ]

    return () => {
      for (const off of offs) off()
    }
  }, [client, navigate, showToast, t])
}

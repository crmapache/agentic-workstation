import { useTranslation } from 'react-i18next'

import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import { useClient } from '../../lib/client'
import { newId } from '../../lib/ids'
import { useToastStore } from '../../state/toast.store'
import { useVoiceCallStore } from '../../state/voice-call.store'
import { isCallActive } from '../../state/voice-call.utils'
import { dropEngine, callEngines } from './call-engines'
import { PhoneCallEngine } from './phone-call-engine'

/**
 * Голосовой звонок с этой IDE (ADR 0104): начать - в нажатии кнопки (динамик и микрофон, потом
 * просьба IDE), положить трубку, «Стоп», микрофон. Ответ IDE на просьбу ловит хост звонков.
 */
export const useVoiceCall = (agentId: string) => {
  const { t } = useTranslation()
  const client = useClient()
  const call = useVoiceCallStore((state) => state.calls[agentId])
  const begin = useVoiceCallStore((state) => state.begin)
  const clear = useVoiceCallStore((state) => state.clear)
  const showToast = useToastStore((state) => state.show)
  const callId = call?.phase === 'live' ? (call.call?.callId ?? null) : null

  const say = (message: Record<string, unknown>) =>
    callId && void client.send(agentId, { p: PROTOCOL_VERSION, k: 'voice', callId, ...message })

  const start = async () => {
    if (isCallActive(call)) return

    const engine = await PhoneCallEngine.prepare(client, agentId).catch(() => null)

    if (!engine) return showToast(t('voice.micDenied'), t('voice.micDeniedHint'))

    const ref = newId()

    dropEngine(agentId)
    callEngines.set(agentId, engine)
    begin(agentId, ref)

    if (await client.send(agentId, { p: PROTOCOL_VERSION, k: 'voice', act: 'start', ref })) return

    dropEngine(agentId)
    clear(agentId)
    showToast(t('voice.offline'))
  }

  const mute = (on: boolean) => {
    callEngines.get(agentId)?.setMuted(on)
    say({ act: 'mute', on })
  }

  return {
    call,
    start: () => void start(),
    end: () => say({ act: 'end' }),
    stop: () => say({ act: 'stop' }),
    mute,
  }
}

/** Звонок, который идёт в этом разговоре, - для полосы звонка над ним; нет - null. */
export const useCallOfConversation = (agentId: string, conversationId: string) =>
  useVoiceCallStore((state) => {
    const call = state.calls[agentId]

    return call?.phase === 'live' && call.call?.conversationId === conversationId ? call.call : null
  })

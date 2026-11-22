import type { VoiceEvent, VoiceCallWire } from '@agentic-workstation/remote-protocol/agent-messages'

/** Где звонок: просьба ушла, идёт, IDE отказала, кончился. */
export type PhoneCallPhase = 'starting' | 'live' | 'refused' | 'ended'

/**
 * Голосовой звонок телефона с одной IDE (ADR 0104): ref - своя просьба (ответ IDE ищет её по
 * нему), звонок - каким его видит IDE, причина отказа или конца и где разговор звонка.
 */
export type PhoneCall = {
  ref: string
  phase: PhoneCallPhase
  call: VoiceCallWire | null
  reason: string | null
  projectKey: string | null
  conversationId: string | null
}

export const startingCall = (ref: string): PhoneCall => ({
  ref,
  phase: 'starting',
  call: null,
  reason: null,
  projectKey: null,
  conversationId: null,
})

/**
 * Слово звонка от IDE - в звонок телефона. Чужое (ответ на прежнюю просьбу, состояние
 * кончившегося звонка) - мимо. Состояние может прийти раньше «начат»: IDE шлёт его, пока
 * поднимает звонок, - оно уже про этот звонок.
 */
export const applyVoiceEvent = (
  current: PhoneCall | undefined,
  event: VoiceEvent,
): PhoneCall | undefined => {
  if (!current) return current

  switch (event.kind) {
    case 'started':
      return event.ref === current.ref
        ? {
            ...current,
            phase: 'live',
            call: event.call,
            projectKey: event.call.projectKey,
            conversationId: event.call.conversationId,
          }
        : current
    case 'refused':
      return event.ref === current.ref && current.phase === 'starting'
        ? { ...current, phase: 'refused', reason: event.reason }
        : current
    case 'state':
      return current.phase === 'starting' || current.call?.callId === event.call.callId
        ? { ...current, call: event.call }
        : current
    case 'ended':
      return current.call?.callId === event.callId
        ? {
            ...current,
            phase: 'ended',
            reason: event.reason,
            projectKey: event.projectKey,
            conversationId: event.conversationId,
          }
        : current
    default:
      return current
  }
}

/** Звонок идёт или поднимается: второй не начать, звук нужен. */
export const isCallActive = (call: PhoneCall | undefined): boolean =>
  call?.phase === 'starting' || call?.phase === 'live'

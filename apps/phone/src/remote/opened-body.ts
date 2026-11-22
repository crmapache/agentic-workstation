import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { parseAgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { AudioFrame } from '@agentic-workstation/remote-protocol/audio-frame'
import { decodeAudio, isAudioBody } from '@agentic-workstation/remote-protocol/audio-frame'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'

/** Открытое тело кадра IDE: слово протокола или кадр звука звонка (ADR 0104). */
export type OpenedBody = { audio: AudioFrame } | { message: AgentMessage }

/** Что в открытом теле; ни слово, ни звук - null. Звук узнаётся по первому байту, без разбора JSON. */
export const readOpened = (bytes: Uint8Array): OpenedBody | null => {
  if (isAudioBody(bytes)) {
    const audio = decodeAudio(bytes)

    return audio ? { audio } : null
  }

  const message = parseAgentMessage(decodeBody(bytes))

  return message ? { message } : null
}

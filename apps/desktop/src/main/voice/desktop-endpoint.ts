import { systemPreferences } from 'electron'

import { broadcast } from '../ipc/broadcast'
import type { VoiceEndpoint } from './call/voice-endpoint'

/**
 * Окно IDE - конечная точка звонка из панели: ответ - событием `voice:audio`, сигналы -
 * `voice:cue`. Состояние звонка окно и так берёт из `voice:changed`, сигнал state ему не нужен.
 */
export const desktopEndpoint: VoiceEndpoint = {
  origin: 'desktop',
  play: (pcm, epoch, frame) => broadcast('voice:audio', { epoch, frame, pcm: new Uint8Array(pcm) }),
  cue: (cue) => {
    if (cue.kind !== 'state') broadcast('voice:cue', cue)
  },
}

/**
 * Дала ли macOS микрофон: первый раз она спрашивает человека своим окном. На Windows спрашивать
 * некому - доступ решают настройки конфиденциальности системы, getUserMedia скажет сам.
 */
export const microphoneAllowed = async (): Promise<boolean> => {
  if (process.platform !== 'darwin') return true

  const status = systemPreferences.getMediaAccessStatus('microphone')

  if (status === 'granted') return true
  if (status === 'denied' || status === 'restricted') return false

  return systemPreferences.askForMediaAccess('microphone')
}

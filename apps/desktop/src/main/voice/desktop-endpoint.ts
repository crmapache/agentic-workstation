import { app, systemPreferences } from 'electron'

import { broadcast } from '../ipc/broadcast'
import type { VoiceEndpoint } from './call/voice-endpoint'
import type { ReadingSink } from './reading/reading'

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

/** Окно IDE - слушатель чтения вслух: звук и конец - событием `voice:reading` под id окна. */
export const desktopReading = (readingId: string): ReadingSink => ({
  audio: (pcm) => broadcast('voice:reading', { readingId, kind: 'audio', pcm }),
  end: (outcome) => broadcast('voice:reading', { readingId, kind: 'end', outcome }),
})

/**
 * Дала ли macOS микрофон: первый раз она спрашивает человека своим окном. На Windows спрашивать
 * некому - доступ решают настройки конфиденциальности системы, getUserMedia скажет сам.
 */
export const microphoneAllowed = async (): Promise<boolean> => {
  // Микрофон из файла (проверка копии окна): настоящего устройства нет, спрашивать macOS незачем.
  if (
    process.platform !== 'darwin' ||
    app.commandLine.hasSwitch('use-fake-device-for-media-stream')
  ) {
    return true
  }

  const status = systemPreferences.getMediaAccessStatus('microphone')

  if (status === 'granted') return true
  if (status === 'denied' || status === 'restricted') return false

  return systemPreferences.askForMediaAccess('microphone')
}

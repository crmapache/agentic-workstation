import { useDesktopCallAudio } from './VoiceHost.hooks'

/**
 * Звук голосового звонка из панели (ADR 0104) - на всё окно, а не в панели провайдера: панель
 * грузится по первому показу и может быть свёрнута, а звонок должен звучать всегда. Своей
 * разметки нет.
 */
export const VoiceHost = () => {
  useDesktopCallAudio()

  return null
}

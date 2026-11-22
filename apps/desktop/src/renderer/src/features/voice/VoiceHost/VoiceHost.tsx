import { useReadAloudAudio, useDesktopCallAudio } from './VoiceHost.hooks'

/**
 * Звук голосового звонка из панели (ADR 0104) и «Прочитать вслух» (ADR 0106) - на всё окно, а не
 * в панели провайдера: панель грузится по первому показу и может быть свёрнута, а звонок и
 * чтение должны звучать всегда. Своей разметки нет.
 */
export const VoiceHost = () => {
  useDesktopCallAudio()
  useReadAloudAudio()

  return null
}

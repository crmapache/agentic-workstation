import { useVoiceCallHost } from './VoiceCallHost.hooks'

/**
 * Звук голосовых звонков страницы (ADR 0104) - в корне, а не на экране: звонок продолжается,
 * пока человек ходит по экранам. Своей разметки нет.
 */
export const VoiceCallHost = () => {
  useVoiceCallHost()

  return null
}

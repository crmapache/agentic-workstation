import { useReadAloudHost } from './ReadAloudHost.hooks'

/**
 * Звук «Прочитать вслух» (ADR 0106) - в корне, а не у кнопки: чтение продолжается, пока
 * человек листает ленту и ходит по экранам. Своей разметки нет.
 */
export const ReadAloudHost = () => {
  useReadAloudHost()

  return null
}

import type { editor } from 'monaco-editor/editor/editor.api.js'

import { PASTE_HANDLER } from './editor.constants'
import { plainPastePayload } from './paste-line-breaks.utils'

/**
 * Текст последнего копирования из кода IDE. Monaco кладёт его в буфер сам, в событии copy, и
 * к документу событие доходит уже с ним. Обычное копирование страницы заполняет буфер после
 * события - тогда здесь пусто.
 */
let copiedFromCode = ''
let watching = false

const noteCopy = (event: ClipboardEvent) => {
  copiedFromCode = event.clipboardData?.getData('text/plain') ?? ''
}

const watchCopies = () => {
  if (watching) return

  watching = true
  document.addEventListener('copy', noteCopy)
  document.addEventListener('cut', noteCopy)
}

/**
 * Перенос строки во вставленном из Notes, Telegram и подобных - настоящей строкой, а не ромбом
 * с вопросом посреди строки. Подменяется текст до вставки, а не правится после: ⌘Z убирает
 * вставку одним шагом. Все пути вставки Monaco (⌘V, меню, «вставить как») сходятся в trigger.
 */
export const normalizePastedLineBreaks = (instance: editor.IStandaloneCodeEditor) => {
  watchCopies()

  const trigger = instance.trigger.bind(instance)

  instance.trigger = (source, handlerId, payload) =>
    trigger(
      source,
      handlerId,
      handlerId === PASTE_HANDLER ? plainPastePayload(payload, copiedFromCode) : payload,
    )
}

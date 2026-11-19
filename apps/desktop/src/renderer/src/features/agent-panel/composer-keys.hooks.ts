import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

import type { DraftToken } from '@shared/message-draft'

import type { Field } from './field.types'
import { enterAction } from './send-key.utils'

type KeyOptions = {
  field: Field
  tokens: DraftToken[]
  /** Отправленные из вкладки сообщения, старые первыми. */
  sent: readonly DraftToken[][]
  /** Подсказка над полем забирает свои клавиши; true - клавиша её. */
  suggestKey: (event: globalThis.KeyboardEvent) => boolean
  /** Отпустить сообщение: сейчас или в очередь. */
  letGo: (mode: 'send' | 'queue') => void
  /** Клавиша отправки ставит в очередь: сообщение вынимали из неё поправить, а ход идёт. */
  keyQueues: boolean
  isRunning: boolean
}

const isLetter = (event: KeyboardEvent, letter: string) =>
  event.code === `Key${letter.toUpperCase()}` || event.key.toLowerCase() === letter

/**
 * Клавиши поля (как в ACC), по старшинству: набор иероглифа - не наш, подсвеченный чип,
 * своя история отмен, открытая подсказка, ↑ и ↓ по отправленному, Enter - отправить
 * (Shift+Enter - перенос), ⌥Enter - в очередь.
 */
export const useComposerKeys = (options: KeyOptions) => {
  const { field } = options
  const browsing = useRef<number | null>(null)
  const draftBefore = useRef<DraftToken[] | null>(null)

  /** ↑ на пустом поле или во время листания - прошлые сообщения; ↓ - назад до своего черновика. */
  const walkHistory = (event: KeyboardEvent): boolean => {
    const { sent, tokens } = options
    const index = browsing.current

    if (event.key === 'ArrowUp' && (tokens.length === 0 || index !== null) && sent.length > 0) {
      if (index === null) draftBefore.current = tokens

      browsing.current = Math.max(0, (index ?? sent.length) - 1)
      field.applyTokens(sent[browsing.current] ?? [])

      return true
    }

    if (event.key !== 'ArrowDown' || index === null) return false

    if (index + 1 >= sent.length) {
      browsing.current = null
      field.applyTokens(draftBefore.current ?? [])
      draftBefore.current = null
    } else {
      browsing.current = index + 1
      field.applyTokens(sent[index + 1] ?? [])
    }

    return true
  }

  const letGo = (mode: 'send' | 'queue') => {
    browsing.current = null
    draftBefore.current = null
    options.letGo(mode)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const native = event.nativeEvent

    // Пока метод ввода собирает символ, клавиатура его: Esc лишь выбрасывает символ.
    if (native.isComposing) {
      if (event.key === 'Escape') event.stopPropagation()

      return
    }

    if (field.handleChipKey(native)) return

    if ((event.metaKey || event.ctrlKey) && (isLetter(event, 'z') || isLetter(event, 'y'))) {
      event.preventDefault()

      return isLetter(event, 'y') || event.shiftKey ? field.redo() : field.undo()
    }

    if (options.suggestKey(native)) return

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && walkHistory(event)) {
      return event.preventDefault()
    }

    if (event.key !== 'Enter') return

    event.preventDefault()

    if (event.altKey) return letGo(options.isRunning ? 'queue' : 'send')

    if (enterAction(event) === 'send') {
      return letGo(options.keyQueues && options.isRunning ? 'queue' : 'send')
    }

    // Перенос строки - командой браузера: свой узел через Range теряет каретку, а
    // insertText с переводом строки делит поле на блоки.
    document.execCommand('insertLineBreak')
  }

  return { handleKeyDown, letGo }
}

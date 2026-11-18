import type { DraftChip, DraftToken } from '@shared/claude-draft'

import { atQueryAt } from './field-caret'
import {
  fieldEnd,
  charAfter,
  charBefore,
  currentRange,
  dropEmptyText,
  insertAtRange,
  padTrailingBreak,
  needsLeadingSpace,
  needsTrailingSpace,
} from './field-dom'
import type { Field, ChipSpot, FieldInsert } from './field.types'
import { kindOfPath } from './message-replay.utils'

const selectRange = (range: Range) => {
  const selection = window.getSelection()

  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Вставка в место каретки - так же, как в ACC: вложение встаёт там, где была каретка, а
 * не в конце, с пробелом по краям (иначе слипнется со словами в одно нечитаемое слово),
 * и каждая вставка - свой шаг отмены. Фокус ушёл из поля (цитата из ленты, кнопка) - туда,
 * где каретку оставили. Брошенные файлы - в конец (spot 'end').
 */
export const useFieldInsert = (field: Field): FieldInsert => {
  const { fieldRef, registry } = field

  const finish = (range: Range, tail: Node | null) => {
    const root = fieldRef.current

    if (!root) return

    dropEmptyText(root)
    // Вставка в самом конце кончается переносом - каретке нужна строка.
    selectRange((tail && tail === root.lastChild ? padTrailingBreak(root) : null) ?? range)
    field.commit(true)
  }

  const insertChip = (chip: DraftChip, spot: ChipSpot = 'caret') => {
    const root = fieldRef.current

    if (!root) return

    const range = spot === 'end' ? fieldEnd(root) : currentRange(root, field.lastCaret.current)

    range.deleteContents()

    if (needsLeadingSpace(charBefore(range))) insertAtRange(range, document.createTextNode(' '))

    insertAtRange(range, registry.make(chip))

    if (needsTrailingSpace(charAfter(range))) insertAtRange(range, document.createTextNode(' '))

    finish(range, null)
  }

  const insertText = (text: string) => {
    const root = fieldRef.current

    if (!root) return

    const range = currentRange(root, field.lastCaret.current)
    const node = document.createTextNode(text)

    range.deleteContents()
    insertAtRange(range, node)
    finish(range, node)
  }

  /** Куски из буфера - живыми чипами: связь «узел - вложение» у клона из буфера не живёт. */
  const insertTokens = (tokens: readonly DraftToken[]) => {
    const root = fieldRef.current

    if (!root) return

    const range = currentRange(root, field.lastCaret.current)
    let tail: Node | null = null

    range.deleteContents()

    for (const token of tokens) {
      tail =
        token.kind === 'text' ? document.createTextNode(token.value) : registry.make(token.chip)
      insertAtRange(range, tail)
    }

    finish(range, tail)
  }

  /** «@запрос» до каретки - чип файла или папки и пробел за ним. */
  const insertFileReference = (path: string) => {
    const root = fieldRef.current
    const query = root ? atQueryAt(root) : null

    if (!root || !query) return

    const range = document.createRange()

    range.setStart(query.node, query.start)
    range.setEnd(query.node, query.end)
    range.deleteContents()
    // Картинка - чипом картинки (с превью под курсором), как в ACC: вид - по расширению.
    insertAtRange(range, registry.make({ kind: kindOfPath(path), value: path }))
    insertAtRange(range, document.createTextNode(' '))
    finish(range, null)
  }

  return { insertChip, insertText, insertTokens, insertFileReference }
}

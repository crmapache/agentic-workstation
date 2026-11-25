import { useRef, useState, useEffect, useLayoutEffect } from 'react'

import type { DraftToken } from '@shared/message-draft'

import { headText, chipBesideCaret, scrollCaretIntoView } from './field-caret'
import { removeChip, ChipRegistry, relabelImages, relabelQuotes } from './field-chips'
import {
  rebuildDom,
  restoreCaret,
  takeKeyboard,
  extractTokens,
  placeCaretBefore,
  placeCaretBeside,
} from './field-dom'
import { dragSelection, caretAboveFirstLine } from './field-pointer'
import { MODIFIER_KEYS, UNDO_COALESCE_MS } from './field.constants'
import type { Field, FieldOptions } from './field.types'
import { captureCommand } from './slash-capture.utils'

const isComposing = (event: Event) => event instanceof InputEvent && event.isComposing

/**
 * Поле ввода с чипами внутри текста (как в ACC): contentEditable, своя история отмен
 * (браузерная чипов не видит - они кладутся через Range), набор иероглифов не
 * перестраивается, пока символ не дописан, стрелка останавливается на чипе, Backspace
 * удаляет именно его. Черновик - снаружи; поле сообщает каждую правку.
 */
export const useField = (options: FieldOptions): Field => {
  const fieldRef = useRef<HTMLDivElement>(null)
  const [registry] = useState(() => new ChipRegistry(options.chipClassName))
  const latest = useRef(options)
  /** Последнее, что поле сообщило само: такие куски уже в DOM, пересобирать незачем. */
  const lastReported = useRef<DraftToken[] | null>(null)
  const undoStack = useRef<DraftToken[][]>([])
  const redoStack = useRef<DraftToken[][]>([])
  const lastEditAt = useRef(0)
  const selectedChip = useRef<HTMLElement | null>(null)
  /** Где каретка стояла в поле последний раз: выделение в ленте её сбивает, а вставка - нет. */
  const lastCaret = useRef<Range | null>(null)

  useLayoutEffect(() => {
    latest.current = options
  })

  const readTokens = () => {
    const root = fieldRef.current

    if (!root) return latest.current.tokens

    relabelImages(root, latest.current.imageBase, registry)
    relabelQuotes(root, registry)

    const tokens = extractTokens(root, registry.chipOf)

    registry.prune()

    return tokens
  }

  /** Подряд набранное - один шаг отмены; вложения и правки кода - всегда свой шаг. */
  const commitHistory = (before: DraftToken[], boundary: boolean) => {
    const now = Date.now()
    const duplicate = undoStack.current.at(-1) === before
    const coalesce =
      !boundary && undoStack.current.length > 0 && now - lastEditAt.current < UNDO_COALESCE_MS

    if (!duplicate && !coalesce) undoStack.current.push(before)

    lastEditAt.current = now
    redoStack.current = []
  }

  const report = (next: DraftToken[], boundary: boolean) => {
    commitHistory(latest.current.tokens, boundary)
    lastReported.current = next
    latest.current.onChange(next)

    if (fieldRef.current) scrollCaretIntoView(fieldRef.current)
  }

  const clearChipSelection = () => {
    if (selectedChip.current) delete selectedChip.current.dataset['selected']

    selectedChip.current = null
  }

  const fill = (tokens: DraftToken[]) => {
    const root = fieldRef.current

    if (!root) return

    clearChipSelection()
    // Пересборка сдвинула бы запомненную каретку в начало поля: после неё - конец.
    lastCaret.current = null
    rebuildDom(root, tokens, registry.make)
    relabelImages(root, latest.current.imageBase, registry)
    relabelQuotes(root, registry)
    registry.prune()
    lastReported.current = tokens
  }

  const applyTokens = (next: DraftToken[]) => {
    fill(next)
    report(readTokens(), true)
  }

  const restore = (next: DraftToken[]) => {
    fill(next)

    if (fieldRef.current) scrollCaretIntoView(fieldRef.current)

    latest.current.onChange(next)
  }

  const undo = () => {
    const previous = undoStack.current.pop()

    if (previous === undefined) return

    redoStack.current.push(latest.current.tokens)
    restore(previous)
  }

  const redo = () => {
    const next = redoStack.current.pop()

    if (next === undefined) return

    undoStack.current.push(latest.current.tokens)
    restore(next)
  }

  const captureTyped = (next: DraftToken[]) => {
    const root = fieldRef.current
    const captured = root
      ? captureCommand(next, latest.current.commands, headText(root, registry.chipOf))
      : null

    if (!root || !captured) return false

    applyTokens(captured)
    // За чипом и пробелом после него - там набирают аргумент.
    placeCaretBefore(root, 2)

    return true
  }

  const applyEdit = (composing: boolean) => {
    const root = fieldRef.current

    if (!root) return

    const next = readTokens()

    // Пока символ не дописан, поле не перестраивается - но сообщается как обычно: по
    // черновику соседи понимают, что клавиши заняты.
    if (!composing) {
      if (next.length === 0 && root.childNodes.length > 0) root.replaceChildren()
      if (captureTyped(next)) return
    }

    report(next, false)
  }

  // Куски пришли не из поля (вкладка, отправка, подстановка) - DOM отстал, пересобрать.
  useLayoutEffect(() => {
    const reported = lastReported.current
    // Опустевшее поле черновик хранит общим пустым массивом - это не чужие куски.
    const same =
      options.tokens === reported || (options.tokens.length === 0 && reported?.length === 0)

    if (!same) fill(options.tokens)
  })

  // Номера картинок сдвинулись (сообщение ушло): это не правка человека.
  useEffect(() => {
    const root = fieldRef.current

    if (!root || !relabelImages(root, options.imageBase, registry)) return

    const next = extractTokens(root, registry.chipOf)

    lastReported.current = next
    latest.current.onChange(next)
  }, [options.imageBase, registry])

  // Выделение на странице одно: выделили текст в ленте - каретка поля пропала. Запоминаем её
  // живым Range (он сам едет за правками вокруг), чтобы цитата встала туда, а не в конец.
  useEffect(() => {
    const remember = () => {
      const root = fieldRef.current
      const selection = window.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

      if (root && range && root.contains(range.startContainer)) {
        lastCaret.current = range.cloneRange()
      }
    }

    document.addEventListener('selectionchange', remember)

    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  // Отмена из меню (Edit → Undo, контекстное меню) запускает браузерную: уводим в свою.
  useEffect(() => {
    const field = fieldRef.current
    const history = { undo, redo }
    const onNative = (event: Event) => {
      const type = (event as InputEvent).inputType

      if (type !== 'historyUndo' && type !== 'historyRedo') return

      event.stopPropagation()

      if (type === 'historyUndo' && undoStack.current.length > 0) history.undo()
      else if (type === 'historyRedo' && redoStack.current.length > 0) history.redo()
      else fill(latest.current.tokens)
    }

    field?.addEventListener('input', onNative, true)

    return () => field?.removeEventListener('input', onNative, true)
  })

  const handleChipKey = (event: KeyboardEvent): boolean => {
    const root = fieldRef.current
    const selected = selectedChip.current

    if (!root || MODIFIER_KEYS.includes(event.key)) return false

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      clearChipSelection()

      return false
    }

    if (selected && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      placeCaretBeside(selected, 'before')
      clearChipSelection()
      removeChip(root, selected, registry)

      return true
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      clearChipSelection()

      return false
    }

    if (selected) {
      event.preventDefault()
      placeCaretBeside(selected, event.key === 'ArrowLeft' ? 'before' : 'after')
      clearChipSelection()

      return true
    }

    const chip = chipBesideCaret(
      root,
      event.key === 'ArrowLeft' ? 'backward' : 'forward',
      registry.chipOf,
    )

    if (!chip) return false

    event.preventDefault()
    chip.dataset['selected'] = ''
    selectedChip.current = chip

    return true
  }

  /**
   * Нажатие в поле: подсвеченный чип гаснет, а нажатие выше первой строки поле ставит само -
   * на первую строку под курсором, а не в начало текста (field-pointer).
   */
  const handleMouseDown = (event: MouseEvent) => {
    const root = fieldRef.current

    clearChipSelection()

    if (!root || event.target !== root || event.button !== 0) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const caret = caretAboveFirstLine(root, event.clientX, event.clientY, registry.chipOf)
    const selection = window.getSelection()

    if (!caret || !selection) return

    event.preventDefault()
    // Сначала фокус: возврат каретки при фокусе (restoreCaret) иначе перебил бы место нажатия.
    root.focus({ preventScroll: true })

    // Shift тянет выделение от прежней каретки, как у браузера.
    if (event.shiftKey && selection.anchorNode && root.contains(selection.anchorNode)) {
      selection.extend(caret.startContainer, caret.startOffset)
    } else {
      selection.removeAllRanges()
      selection.addRange(caret)
    }

    dragSelection(root, registry.chipOf)
  }

  return {
    fieldRef,
    registry,
    lastCaret,
    takeKeyboard: () => {
      if (fieldRef.current) takeKeyboard(fieldRef.current, lastCaret.current)
    },
    applyTokens,
    commit: (boundary = true) => report(readTokens(), boundary),
    refresh: () => {
      const next = readTokens()

      lastReported.current = next
      latest.current.onChange(next)
    },
    captureTyped,
    readTokens,
    undo,
    redo,
    clearChipSelection,
    handleChipKey,
    handleInput: (event) => applyEdit(isComposing(event)),
    handleCompositionEnd: () => applyEdit(false),
    handleMouseDown,
    handleFocus: () => {
      if (fieldRef.current) restoreCaret(fieldRef.current, lastCaret.current)
    },
  }
}

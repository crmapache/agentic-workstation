import { useRef, useState, useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { focusOnRevert } from './diff-revert'
import { useDiffViewStore } from './diff-view.store'
import { documents } from './documents'
import {
  takeFocus,
  followTextSize,
  hideFindFromPalette,
  remeasureWhenLoaded,
} from './editor-instance'
import { diffViewOptions, scrollbarOptions, diffEditorOptions } from './editor-options'
import { watchSelection } from './editor-selection'
import type { SelectionWatch } from './editor-selection'
import { DIFF_ACTIONS } from './editor.constants'
import { useEditorStore } from './editor.store'
import { monaco } from './monaco-setup'
import { hasClassicScrollbars } from './CodeEditor/CodeEditor.utils'

type Diff = editor.IStandaloneDiffEditor
type Editor = editor.IStandaloneCodeEditor

/**
 * Разница Monaco: создаётся вместе с компонентом, файлы меняются парами моделей. Правая
 * сторона, если это документ файла, - как в редакторе: уход из неё пишет файл, выделение
 * уходит полю Claude Code. Вид (колонки, свёрнутое) берётся из выбора человека и меняется на
 * ходу. Общая для разницы с коммитом и локальной истории.
 */
const useMonacoDiff = (isShown: RefObject<boolean>) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const diffRef = useRef<Diff | null>(null)
  const originalRef = useRef<Editor | null>(null)
  const modifiedRef = useRef<Editor | null>(null)
  const selectionRef = useRef<SelectionWatch | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const probe = probeRef.current

    if (!host || !probe) return

    const diff = monaco.editor.createDiffEditor(
      host,
      diffEditorOptions(hasClassicScrollbars(probe), useDiffViewStore.getState()),
    )
    const original = diff.getOriginalEditor()
    const modified = diff.getModifiedEditor()
    const scrollbars = new ResizeObserver(() =>
      diff.updateOptions({ scrollbar: scrollbarOptions(hasClassicScrollbars(probe)) }),
    )
    const shownDocument = () => documents.findByModel(modified.getModel()) ?? null

    scrollbars.observe(probe)
    diffRef.current = diff
    originalRef.current = original
    modifiedRef.current = modified

    hideFindFromPalette(original)
    hideFindFromPalette(modified)
    focusOnRevert(diff)
    modified.onDidBlurEditorText(() => void shownDocument()?.save())
    remeasureWhenLoaded()

    const selection = watchSelection(modified, shownDocument, () => isShown.current)

    selectionRef.current = selection

    const view = useDiffViewStore.subscribe((state) => diff.updateOptions(diffViewOptions(state)))
    const unfollowTextSize = followTextSize(diff)
    // Модель уходит, пока стоит в разнице (документ файла закрыли): сначала отпустить пару -
    // иначе Monaco считает это ошибкой. Сервис моделей узнаёт об уходе раньше самой разницы.
    const disposing = monaco.editor.onWillDisposeModel((model) => {
      const pair = diff.getModel()

      if (pair?.original === model || pair?.modified === model) diff.setModel(null)
    })

    return () => {
      scrollbars.disconnect()
      selection.dispose()
      view()
      unfollowTextSize()
      disposing.dispose()
      diff.setModel(null)
      diff.dispose()
      diffRef.current = null
      originalRef.current = null
      modifiedRef.current = null
      selectionRef.current = null
    }
  }, [isShown])

  return { hostRef, probeRef, diffRef, originalRef, modifiedRef, selectionRef }
}

/** Сколько правок нашёл Monaco; null - ещё считает или пары нет. */
const useChangeCount = (diffRef: RefObject<Diff | null>) => {
  const [counted, setCounted] = useState<DiffCount>(NOT_COUNTED)

  useEffect(() => {
    const diff = diffRef.current

    if (!diff) return

    // Переводы строк сравниваются, только когда текст есть с обеих сторон: у нового файла
    // пустая сторона - перевод строк Monaco по умолчанию, а не файла.
    const update = () => {
      const pair = diff.getModel()

      setCounted(
        pair
          ? {
              count: diff.getLineChanges()?.length ?? null,
              eolChanged:
                pair.original.getValueLength() > 0 &&
                pair.modified.getValueLength() > 0 &&
                pair.original.getEOL() !== pair.modified.getEOL(),
            }
          : NOT_COUNTED,
      )
    }
    const listeners = [diff.onDidUpdateDiff(update), diff.onDidChangeModel(update)]

    return () => {
      for (const listener of listeners) listener.dispose()
    }
  }, [diffRef])

  return counted
}

/** Сколько правок нашёл Monaco (null - ещё считает или пары нет) и разные ли переводы строк. */
type DiffCount = { count: number | null; eolChanged: boolean }

const NOT_COUNTED: DiffCount = { count: null, eolChanged: false }

/**
 * Клавиши разницы с любой стороны: F7 и Shift+F7 - к следующей и предыдущей правке. ⌘Z и
 * ⇧⌘Z слева - отмена и повтор файла справа: слева отменять нечего, а нажимают их, чтобы
 * вернуть кусок, возвращённый стрелкой. Фокус уходит туда, где видна отмена.
 */
const useDiffKeys = (
  { diffRef, originalRef, modifiedRef }: ReturnType<typeof useMonacoDiff>,
  goTo: (target: 'next' | 'previous') => void,
) => {
  const { t } = useTranslation()
  const latest = useRef(goTo)

  useEffect(() => {
    latest.current = goTo
  })

  useEffect(() => {
    const { KeyCode, KeyMod } = monaco
    const original = originalRef.current
    const modified = modifiedRef.current
    const inFile = (command: 'undo' | 'redo') => () => {
      modified?.focus()
      modified?.trigger('keyboard', command, null)
    }
    const steps = [original, modified].flatMap((instance) =>
      instance
        ? [
            instance.addAction({
              id: DIFF_ACTIONS.nextChange,
              label: t('editor.diff.nextChange'),
              keybindings: [KeyCode.F7],
              run: () => latest.current('next'),
            }),
            instance.addAction({
              id: DIFF_ACTIONS.previousChange,
              label: t('editor.diff.previousChange'),
              keybindings: [KeyMod.Shift | KeyCode.F7],
              run: () => latest.current('previous'),
            }),
          ]
        : [],
    )
    const history = original
      ? [
          original.addAction({
            id: DIFF_ACTIONS.undo,
            label: t('editor.diff.undo'),
            keybindings: [KeyMod.CtrlCmd | KeyCode.KeyZ],
            run: inFile('undo'),
          }),
          original.addAction({
            id: DIFF_ACTIONS.redo,
            label: t('editor.diff.redo'),
            keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ],
            run: inFile('redo'),
          }),
        ]
      : []

    return () => {
      for (const registration of [...steps, ...history]) registration.dispose()
    }
  }, [diffRef, originalRef, modifiedRef, t])
}

/**
 * Разница на Monaco с поведением, общим для разницы с коммитом и локальной истории: счёт
 * правок, переходы по ним (кнопками и клавишами), только чтение, выделение - полю Claude
 * Code, когда вкладка снова активна, клавиатура по просьбе вкладки - только у активной,
 * спрятанная её не берёт. Модели сторон ставит тот, кто зовёт: у каждой разницы свои.
 */
export const useDiffBehavior = ({
  isActive,
  readOnly,
}: {
  isActive: boolean
  readOnly: boolean
}) => {
  const { t } = useTranslation()
  const isShown = useRef(isActive)
  const monacoDiff = useMonacoDiff(isShown)
  const { diffRef, modifiedRef, selectionRef } = monacoDiff
  const { count, eolChanged } = useChangeCount(diffRef)
  const focusSerial = useEditorStore((store) => store.focusSerial)
  // Просьбы до появления разницы - не к ней: открыл разницу из списка - клавиатура в списке.
  const focusSeen = useRef(focusSerial)

  const goTo = (target: 'next' | 'previous') => {
    diffRef.current?.goToDiff(target)
    modifiedRef.current?.focus()
  }

  useDiffKeys(monacoDiff, goTo)

  useEffect(() => {
    diffRef.current?.updateOptions({ readOnly, readOnlyMessage: { value: t('editor.readOnly') } })
  }, [diffRef, readOnly, t])

  // Вкладка снова активна - полю Claude Code выделение в ней, а не то, что было в файле.
  useEffect(() => {
    isShown.current = isActive
    if (isActive) selectionRef.current?.publish()
  }, [selectionRef, isActive])

  useEffect(() => {
    if (focusSerial === focusSeen.current) return

    focusSeen.current = focusSerial
    if (isActive) takeFocus(modifiedRef.current)
  }, [modifiedRef, focusSerial, isActive])

  return { ...monacoDiff, count, eolChanged, goTo }
}

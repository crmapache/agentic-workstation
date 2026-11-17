import { useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { useDefinitionLinks } from '../definition.hooks'
import { documents } from '../documents'
import { documentKey } from '../documents.utils'
import type { EditorDocument } from '../editor-document'
import {
  takeFocus,
  followTextSize,
  holdMinimapWidth,
  hideFindFromPalette,
  remeasureWhenLoaded,
} from '../editor-instance'
import { editorOptions, fileScrollbarOptions } from '../editor-options'
import { watchSelection } from '../editor-selection'
import type { SelectionWatch } from '../editor-selection'
import { useEditorStore } from '../editor.store'
import type { DocumentStatus, MarkdownLayout } from '../editor.types'
import { useMarkdownLayoutStore } from '../markdown-layout.store'
import { usePreviewScrollSync } from '../markdown-scroll.hooks'
import { monaco } from '../monaco-setup'
import { normalizePastedLineBreaks } from '../paste-line-breaks'
import type { CodeEditorProps } from './CodeEditor.types'
import { placeRange, hasClassicScrollbars } from './CodeEditor.utils'

type Editor = editor.IStandaloneCodeEditor

/**
 * Редактор файла (ADR 0005, рядом с ним в середине живёт разница - ADR 0020): создаётся
 * вместе с компонентом, файлы меняются моделями. Уход из редактора пишет файл сразу (⌘S -
 * documents.ts). Выделение после короткой паузы уходит полю ввода Claude Code, пока
 * вкладка файла на виду. Полосы прокрутки повторяют системные:
 * их вид macOS меняет на ходу, и проба замечает это по своему размеру.
 */
const useMonacoEditor = (shown: RefObject<EditorDocument | null>, isShown: RefObject<boolean>) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const selectionRef = useRef<SelectionWatch | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const probe = probeRef.current

    if (!host || !probe) return

    const instance = monaco.editor.create(host, editorOptions(hasClassicScrollbars(probe)))
    const scrollbars = new ResizeObserver(() =>
      instance.updateOptions({ scrollbar: fileScrollbarOptions(hasClassicScrollbars(probe)) }),
    )

    scrollbars.observe(probe)

    editorRef.current = instance

    hideFindFromPalette(instance)
    normalizePastedLineBreaks(instance)
    instance.onDidBlurEditorText(() => void shown.current?.save())
    remeasureWhenLoaded()

    const minimapWidth = holdMinimapWidth(instance)
    const unfollowTextSize = followTextSize(instance)
    const selection = watchSelection(
      instance,
      () => shown.current,
      () => isShown.current,
    )

    selectionRef.current = selection

    return () => {
      scrollbars.disconnect()
      minimapWidth.dispose()
      unfollowTextSize()
      selection.dispose()
      selectionRef.current = null
      if (shown.current) shown.current.viewState = instance.saveViewState()

      shown.current = null
      instance.dispose()
      editorRef.current = null
    }
  }, [shown, isShown])

  return { hostRef, probeRef, editorRef, selectionRef }
}

/**
 * Редактор файла активной вкладки: документ файла, его модель в редакторе с курсором и
 * прокруткой, на которых файл оставили, место из ссылки и клавиатура по просьбе вкладки.
 * Рядом с просмотром Markdown - прокрутка вместе с ним.
 */
export const useCodeEditor = ({
  projectId,
  path,
  place,
  isActive,
  status,
  layout,
}: CodeEditorProps & { status: DocumentStatus; layout: MarkdownLayout }) => {
  const { t } = useTranslation()
  const shown = useRef<EditorDocument | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const focusSerial = useEditorStore((state) => state.focusSerial)
  // Просьбы до появления редактора - не к нему: открыл файл из дерева - клавиатура в дереве.
  const focusSeen = useRef(focusSerial)
  const isShown = useRef(isActive)
  const { hostRef, probeRef, editorRef, selectionRef } = useMonacoEditor(shown, isShown)
  const readOnly = status.kind === 'text' && status.readOnly

  useDefinitionLinks(editorRef, shown)

  // Модель файла - в редактор, как только файл прочитан. Прежний файл запоминает, где
  // в нём стояли, и дописывается: переключение вкладки - тоже уход из файла.
  useEffect(() => {
    const instance = editorRef.current
    const document = documents.get(projectId, path)

    if (!instance) return

    const previous = shown.current

    if (previous && previous !== document) {
      previous.viewState = instance.saveViewState()
      void previous.save()
    }

    shown.current = document

    if (instance.getModel() === document.model) return

    instance.setModel(document.model)
    if (document.viewState) instance.restoreViewState(document.viewState)
  }, [editorRef, projectId, path, status.kind])

  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly,
      readOnlyMessage: { value: t('editor.readOnly') },
    })
  }, [editorRef, readOnly, t])

  usePreviewScrollSync(
    editorRef,
    previewRef,
    status.kind === 'text' && layout !== 'editor',
    documentKey(projectId, path),
  )

  // Место из ссылки (поиск, лента Claude Code): выделить и показать, клавиатура - сюда.
  // Один раз на место: документ помнит показанное и после возврата в проект. Файл открыт
  // одним просмотром - рядом встаёт код, и место ставится уже в нём.
  useEffect(() => {
    const instance = editorRef.current
    const model = instance?.getModel()
    const document = shown.current

    if (!instance || !model || !document || !place || document.placed === place) return
    if (layout === 'preview') return useMarkdownLayoutStore.getState().reveal(projectId, path)

    document.placed = place
    // Код мог только что показаться (был один просмотр): Monaco перемеряется в своём
    // ResizeObserver позже, а строку надо поставить в центр уже видимого окна.
    instance.layout()

    const range = placeRange(model, place)

    if (range) {
      instance.setSelection(range)
      instance.revealRangeInCenterIfOutsideViewport(range)
    }

    instance.focus()
  }, [editorRef, projectId, path, place, status.kind, layout])

  // Вкладка файла снова активна - полю Claude Code её выделение, а не то, что было в разнице.
  useEffect(() => {
    isShown.current = isActive
    if (isActive) selectionRef.current?.publish()
  }, [selectionRef, isActive])

  // Просьба отдать клавиатуру - редактору активной вкладки: спрятанный за разницей её не берёт.
  useEffect(() => {
    if (focusSerial === focusSeen.current) return

    focusSeen.current = focusSerial
    if (isActive) takeFocus(editorRef.current)
  }, [editorRef, focusSerial, isActive])

  return { hostRef, probeRef, previewRef, editorRef }
}

/** Ручка между кодом и просмотром: сдвиг мыши - доля ширины под код. */
export const useSplitResize = () => {
  const panesRef = useRef<HTMLDivElement>(null)
  const splitRatio = useMarkdownLayoutStore((state) => state.splitRatio)

  const handleResize = (deltaX: number) => {
    const width = panesRef.current?.clientWidth ?? 0
    const { splitRatio: current, setSplitRatio } = useMarkdownLayoutStore.getState()

    if (width > 0) setSplitRatio(current + deltaX / width)
  }

  return { panesRef, splitRatio, handleResize }
}

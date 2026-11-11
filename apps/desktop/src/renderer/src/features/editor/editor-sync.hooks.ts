import { useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { heldPaths, guardDiscard, useDiscardGuard } from '../../state/discard-guard.store'
import { editorDocuments } from '../../state/editor-documents'
import { activeTab } from '../../state/editor-tabs.utils'
import { isMainShown, useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSelectionStore } from '../../state/selection.store'
import { useActiveProject } from '../../state/workspace.queries'
import { requestCloseTabs } from './editor-close'
import { useEditorStore } from './editor.store'
import { usePreviewImageSync } from './markdown-preview.queries'

const saveAll = () => editorDocuments()?.saveAll() ?? Promise.resolve()

/**
 * Выход из IDE: дописать всё и ответить главному процессу, сколько файлов сохранить
 * нельзя. Есть такие - выход отменяется, а человека спрашивают; согласие выходит заново.
 */
const answerQuit = async () => {
  await saveAll()

  const held = heldPaths()

  await invoke('editor:savedAll', { unsaved: held.length })
  guardDiscard('quit', held, () => {
    useDiscardGuard.getState().allowUnload()
    void invoke('editor:allowQuit', { quit: true })
  })
}

/**
 * Закрыть окно или перезагрузить его с несохранённым нельзя молча: правки живут только в
 * окне. Electron отменяет закрытие, если страница его не отпустила; человек отвечает на
 * вопрос, и согласие закрывает окно.
 */
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  const held = heldPaths()

  if (held.length === 0 || useDiscardGuard.getState().unloadAllowed) return

  event.preventDefault()
  guardDiscard('window', held, () => {
    useDiscardGuard.getState().allowUnload()
    window.close()
  })
}

/** Где у ⌘Z своя отмена: поля ввода, а в открытых диалогах и панелях - их собственная. */
const OWN_HISTORY = 'input, textarea, select, [contenteditable], dialog, [popover]'

/**
 * ⌘Z и ⇧⌘Z вне кода и полей ввода - отмена и повтор в файле середины: фокус уходит в его
 * редактор (у разницы - в правую сторону), и команда выполняется там. Иначе после возврата
 * куска и клика по списку изменений ⌘Z молчал бы, пока не щёлкнешь в код. Monaco свои
 * клавиши гасит сам, поэтому сюда доходят только нажатия мимо него.
 */
const historyKeyHandler = (projectId: string) => (event: KeyboardEvent) => {
  const isHistoryKey = event.metaKey && !event.altKey && !event.ctrlKey && event.code === 'KeyZ'
  const target = event.target instanceof Element ? event.target : null

  if (!isHistoryKey || event.defaultPrevented || target?.closest(OWN_HISTORY)) return

  const layout = useLayoutStore.getState()
  const active = activeTab(useSelectionStore.getState().tabsByProject[projectId])

  if (!active || !isMainShown(layout) || layout.main.activeViewId !== 'file') return

  event.preventDefault()
  useEditorStore.getState().requestFocus(event.shiftKey ? 'redo' : 'undo')
}

/**
 * Редактор и главный процесс: изменения на диске - открытым файлам и картинкам
 * просмотра Markdown, изменения в .git - левой стороне разницы, ⌘W из меню - закрыть
 * активную вкладку (если она сейчас видна), ⌘Z вне кода - отмена в ней, выход из IDE -
 * дописать всё и ответить. Уход
 * из окна пишет файлы сразу, как в WebStorm, а возврат сверяет их с диском. Подключается
 * один раз, в корне окна.
 */
export const useEditorSync = () => {
  const project = useActiveProject()
  const projectId = project?.id
  const queryClient = useQueryClient()

  // Коммит, смена ветки, reset - HEAD уже другой: файлы из него читаются заново.
  useIpcEvent('fs:changed', (change) => {
    editorDocuments()?.diskChanged(change)
    if (change.git) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gitHeadFiles(change.projectId) })
    }
  })
  usePreviewImageSync()

  useEffect(() => {
    if (!projectId) return

    const handleHistoryKey = historyKeyHandler(projectId)

    window.addEventListener('keydown', handleHistoryKey)

    return () => window.removeEventListener('keydown', handleHistoryKey)
  }, [projectId])

  useIpcEvent('editor:command', (command) => {
    if (command === 'saveAll') return void answerQuit()

    const layout = useLayoutStore.getState()
    const active = project && activeTab(useSelectionStore.getState().tabsByProject[project.id])

    if (project && active && isMainShown(layout) && layout.main.activeViewId === 'file') {
      requestCloseTabs(project.id, [active])
    }
  })

  useEffect(() => {
    const handleLeave = () => void saveAll()

    const handleReturn = () => editorDocuments()?.checkAll()

    window.addEventListener('blur', handleLeave)
    window.addEventListener('focus', handleReturn)
    window.addEventListener('pagehide', handleLeave)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('blur', handleLeave)
      window.removeEventListener('focus', handleReturn)
      window.removeEventListener('pagehide', handleLeave)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])
}

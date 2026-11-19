import type { WorkspaceState } from '@shared/workspace'
import { useQueryClient } from '@tanstack/react-query'
import type { ExtensionEditorAsk } from '@shared/ipc/extensions.contract'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { isOutsidePath } from '../../lib/path.utils'
import { editorDocuments } from '../../state/editor-documents'
import { useEditorSelectionStore } from '../../state/editor-selection.store'
import { activeTab, tabTarget } from '../../state/editor-tabs.utils'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSelectionStore } from '../../state/selection.store'

/** Файл проекта, открытый сейчас вкладкой редактора; разница, история и файл за проектом - нет. */
const shownFile = (workspace: WorkspaceState | undefined) => {
  const project = workspace?.projects.find((item) => item.id === workspace.activeProjectId)
  const key = project && activeTab(useSelectionStore.getState().tabsByProject[project.id])
  const target = key ? tabTarget(key) : null

  if (!project || !target || target.kind !== 'file' || isOutsidePath(target.path)) return null

  return { project, path: target.path }
}

/** Ответ окна на вопрос о редакторе: значение или { error } словами для автора расширения. */
const answerFor = (ask: ExtensionEditorAsk, workspace: WorkspaceState | undefined): unknown => {
  if (ask.op === 'open') {
    const project = workspace?.projects.find((item) => item.rootPath === ask.projectPath)

    if (!project || !ask.path) return { error: 'The project is not open.' }
    if (project.id !== workspace?.activeProjectId)
      void invoke('workspace:activateProject', { projectId: project.id })

    useSelectionStore.getState().selectFile(project.id, ask.path, { line: ask.line ?? 1 })
    useLayoutStore.getState().showMainView('file')

    return null
  }

  const shown = shownFile(workspace)

  if (ask.op === 'active') {
    if (!shown) return null

    const { selection } = useEditorSelectionStore.getState()
    const selected =
      selection?.projectId === shown.project.id && selection.path === shown.path ? selection : null

    return {
      projectPath: shown.project.rootPath,
      path: shown.path,
      selection: selected ? { startLine: selected.from, endLine: selected.to } : null,
      selectedText: selected?.text ?? '',
    }
  }

  const bus = editorDocuments()

  if (!shown || !bus) return { error: 'No project file is open in the editor.' }

  const edited = bus.edit(
    shown.project.id,
    shown.path,
    ask.op === 'insert' ? 'insert' : 'replace',
    ask.text ?? '',
  )

  return edited ? null : { error: 'The file is not shown in the editor right now.' }
}

/**
 * Мост редактора для расширений (ADR 0091): главный процесс спрашивает, окно отвечает - что
 * открыто и выделено, вставить, заменить выделенное, открыть файл. Живёт в раскладке окна: на
 * вопрос надо ответить и до того, как загрузился Monaco.
 */
export const useExtensionEditor = () => {
  const queryClient = useQueryClient()

  useIpcEvent('extensions:editorAsk', (ask) => {
    const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)

    void invoke('extensions:answerEditor', {
      requestId: ask.requestId,
      answer: answerFor(ask, workspace),
    })
  })
}

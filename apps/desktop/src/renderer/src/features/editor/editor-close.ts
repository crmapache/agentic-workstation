import { guardDiscard } from '../../state/discard-guard.store'
import { editorDocuments } from '../../state/editor-documents'
import { NO_TABS, pathsLeaving } from '../../state/editor-tabs.utils'
import { useSelectionStore } from '../../state/selection.store'

/**
 * Закрыть вкладки (файлы и разницу): обычные закрываются сразу (несохранённое дописывается
 * само), а если с ними уходит файл с вопросом (конфликт, удалён, не записался, файл за
 * проектом) - сначала спросить человека. Файл, который остаётся открытым другой вкладкой,
 * ничего не теряет - про него не спрашивают. Один путь для крестика, меню вкладки и ⌘W.
 */
export const requestCloseTabs = (projectId: string, keys: readonly string[]) => {
  const { tabsByProject, heldByProject, closeTabs } = useSelectionStore.getState()
  const held = pathsLeaving(tabsByProject[projectId] ?? NO_TABS, keys).filter((path) =>
    heldByProject[projectId]?.includes(path),
  )

  guardDiscard('tabs', held, () => {
    editorDocuments()?.discard(projectId, held)
    closeTabs(projectId, keys)
  })
}

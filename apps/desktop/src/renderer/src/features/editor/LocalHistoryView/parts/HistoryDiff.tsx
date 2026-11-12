import { NO_CONTENT } from '../LocalHistoryView.constants'
import { useHistoryDiff } from '../LocalHistoryView.hooks'
import styles from '../LocalHistoryView.module.scss'
import type { HistoryDiffProps } from '../LocalHistoryView.types'
import { sidesOf, historyDiffState } from '../LocalHistoryView.utils'
import { useDocumentStatus } from '../../editor.store'
import { useHistoryContent } from '../../local-history.queries'
import { useLocalHistoryStore } from '../../local-history.store'
import codeStyles from '../../CodeEditor/CodeEditor.module.scss'
import { EditorContextMenu } from '../../EditorContextMenu/EditorContextMenu'
import { useEditorContextMenu } from '../../EditorContextMenu/EditorContextMenu.hooks'
import { HistoryDiffBar } from './HistoryDiffBar'
import { HistoryPlaceholder } from './HistoryPlaceholder'

/**
 * Разница выбранной версии: с файлом сейчас (справа - сам файл, правится, кусок версии
 * возвращается стрелкой) или изменение события (до и после, только чтение).
 */
export const HistoryDiff = ({ projectId, row, isActive }: HistoryDiffProps) => {
  const compare = useLocalHistoryStore((state) => state.compare)
  const { left, right } = sidesOf(row, compare)
  const rightKey = right.kind === 'version' ? right.key : null
  const leftContent = useHistoryContent(projectId, left, row.path)
  const rightContent = useHistoryContent(projectId, rightKey, row.path)
  const status = useDocumentStatus(projectId, row.path)
  const usesFile = right.kind === 'file'
  const state = historyDiffState({
    left: left === null ? NO_CONTENT : leftContent,
    right,
    rightContent: rightKey === null ? NO_CONTENT : rightContent,
    status,
  })
  const { hostRef, probeRef, originalRef, modifiedRef, count, goTo } = useHistoryDiff({
    projectId,
    path: row.path,
    usesFile,
    state,
    isActive,
  })
  const originalMenu = useEditorContextMenu(originalRef, hostRef)
  const modifiedMenu = useEditorContextMenu(modifiedRef, hostRef)
  const isReady = state.kind === 'ready'

  return (
    <div className={styles.pane}>
      <HistoryDiffBar
        count={isReady ? count : null}
        onPrevious={() => goTo('previous')}
        onNext={() => goTo('next')}
      />
      <div className={styles.frame} hidden={!isReady}>
        <div ref={hostRef} className={styles.host} />
        <EditorContextMenu
          editorRef={originalRef}
          at={originalMenu.at}
          readOnly
          onClose={originalMenu.close}
        />
        <EditorContextMenu
          editorRef={modifiedRef}
          at={modifiedMenu.at}
          readOnly={!isReady || state.readOnly}
          onClose={modifiedMenu.close}
        />
      </div>
      {state.kind !== 'ready' && state.kind !== 'loading' && <HistoryPlaceholder state={state} />}
      <div ref={probeRef} className={codeStyles.scrollbarProbe} aria-hidden />
    </div>
  )
}

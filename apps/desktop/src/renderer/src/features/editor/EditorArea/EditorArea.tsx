import { Suspense } from 'react'
import { FolderOpen, MousePointerClick } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { EditorTabs } from '../EditorTabs/EditorTabs'
import { tabTarget } from '../../../state/editor-tabs.utils'
import {
  useActiveTab,
  useRecentTab,
  useEditorTabs,
  useSelectedPlace,
} from '../../../state/selection.store'
import { useActiveProject, useWorkspaceActions } from '../../../state/workspace.queries'
import { CodeEditor, DiffEditor, LocalHistoryView } from './EditorArea.constants'
import styles from './EditorArea.module.scss'

/**
 * Зона 6, вид «файл»: вкладки проекта, под ними - редактор файла, разница файла с последним
 * коммитом или локальная история, смотря какая вкладка активна. Все, раз показанные, остаются
 * на месте и прячутся: переход между ними не создаёт Monaco заново и не теряет прокрутку.
 * История другого файла или проекта - заново: выбранная версия от прежнего не подходит. Без проекта -
 * приглашение открыть, без вкладок - выбрать файл в дереве.
 */
export const EditorArea = () => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const tabs = useEditorTabs(project?.id)
  const activeKey = useActiveTab(project?.id)
  const file = useRecentTab(project?.id, 'file')
  const diff = useRecentTab(project?.id, 'diff')
  const history = useRecentTab(project?.id, 'history')
  const place = useSelectedPlace(project?.id)
  const { openProject } = useWorkspaceActions()

  if (!project) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t('editor.noProjectTitle')}
        description={t('editor.noProjectText')}
        action={
          <Button variant="primary" onClick={openProject}>
            {t('projects.open')}
          </Button>
        }
      />
    )
  }

  if (!activeKey) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title={t('editor.noFileTitle')}
        description={t('editor.noFileText')}
      />
    )
  }

  const shown = tabTarget(activeKey).kind

  return (
    <div className={styles.editorArea}>
      <EditorTabs
        projectId={project.id}
        projectName={project.name}
        keys={tabs}
        active={activeKey}
      />
      {file !== undefined && (
        <div className={styles.view} hidden={shown !== 'file'}>
          <Suspense fallback={null}>
            <CodeEditor
              projectId={project.id}
              path={file}
              place={place}
              isActive={shown === 'file'}
            />
          </Suspense>
        </div>
      )}
      {diff !== undefined && (
        <div className={styles.view} hidden={shown !== 'diff'}>
          <Suspense fallback={null}>
            <DiffEditor projectId={project.id} path={diff} isActive={shown === 'diff'} />
          </Suspense>
        </div>
      )}
      {history !== undefined && (
        <div className={styles.view} hidden={shown !== 'history'}>
          <Suspense fallback={null}>
            <LocalHistoryView
              key={`${project.id}\u0000${history}`}
              projectId={project.id}
              projectName={project.name}
              path={history}
              isActive={shown === 'history'}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

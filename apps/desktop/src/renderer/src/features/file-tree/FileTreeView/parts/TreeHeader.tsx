import { LocateFixed, ChevronsDownUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import type { TreeHeaderProps } from '../FileTreeView.types'
import { useFileTreeStore } from '../../file-tree.store'
import { useSelectedFile } from '../../../../state/selection.store'

/**
 * Шапка дерева, как ряд окна Project в WebStorm: «Select Opened File» - раскрыть папки до
 * файла в редакторе и показать его строку (файла нет или он вне проекта - кнопка погашена),
 * «Collapse All» - свернуть все папки.
 */
export const TreeHeader = ({ projectId }: TreeHeaderProps) => {
  const { t } = useTranslation()
  const opened = useSelectedFile(projectId)
  const hasExpanded = useFileTreeStore(
    (state) => (state.expandedByProject[projectId]?.length ?? 0) > 0,
  )
  const revealPath = useFileTreeStore((state) => state.revealPath)
  const collapseAll = useFileTreeStore((state) => state.collapseAll)
  const inProject = opened !== undefined && !opened.startsWith('/')

  const handleSelectOpened = () => {
    if (opened !== undefined && inProject) revealPath(projectId, opened)
  }

  const handleCollapseAll = () => collapseAll(projectId)

  return (
    <PageHeader
      size="sm"
      title={t('sideViews.files')}
      actions={
        <>
          <IconButton
            icon={LocateFixed}
            size="sm"
            label={t('fileTree.header.selectOpened')}
            disabled={!inProject}
            onClick={handleSelectOpened}
          />
          <IconButton
            icon={ChevronsDownUp}
            size="sm"
            label={t('fileTree.header.collapseAll')}
            disabled={!hasExpanded}
            onClick={handleCollapseAll}
          />
        </>
      }
    />
  )
}

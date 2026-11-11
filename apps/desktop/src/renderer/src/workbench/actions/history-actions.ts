import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { baseName, isOutsidePath } from '../../lib/path.utils'
import { useSelectedPath, useSelectionStore } from '../../state/selection.store'
import { useActiveProject } from '../../state/workspace.queries'
import type { SearchAction } from '../../features/search-everywhere/search-everywhere.types'

/** Слова, по которым находят локальную историю: так её зовут в WebStorm и в жизни. */
const HISTORY_KEYWORDS = ['local history', 'versions', 'revert', 'restore', 'undo']

/**
 * Локальная история (ADR 0045) в поиске везде: открытого файла и всего проекта - «Recent
 * Changes» WebStorm, откуда и возвращают удалённое. Файл вне проекта истории не имеет.
 */
export const useHistoryActions = (): SearchAction[] => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const file = useSelectedPath(project?.id)
  const openHistory = useSelectionStore((state) => state.openHistory)

  if (!project) return []

  const fileAction: SearchAction[] =
    file && !isOutsidePath(file)
      ? [
          {
            id: 'history.file',
            label: t('searchEverywhere.actions.fileHistory', { name: baseName(file) }),
            icon: History,
            keywords: HISTORY_KEYWORDS,
            run: () => openHistory(project.id, file),
          },
        ]
      : []

  return [
    ...fileAction,
    {
      id: 'history.project',
      label: t('searchEverywhere.actions.projectHistory', { name: project.name }),
      icon: History,
      keywords: [...HISTORY_KEYWORDS, 'recent changes', 'deleted'],
      run: () => openHistory(project.id, ''),
    },
  ]
}

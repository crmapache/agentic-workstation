import { useTranslation } from 'react-i18next'

import type { ActivityMark } from '../ActivityBar/ActivityBar.types'
import { useProjectChange } from '../../state/git-status.queries'
import type { SideViewId } from '../../state/layout.types'
import { useActiveProject } from '../../state/workspace.queries'

/**
 * Точки на иконках видов левой панели. У Changes - есть ли в активном проекте изменения с
 * последнего коммита, цветом папки с изменениями в дереве (красная - конфликт). Берётся из
 * статуса git, который дерево и так читает: второго git status ради точки нет.
 */
export const useSideViewMarks = (): Partial<Record<SideViewId, ActivityMark>> => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const change = useProjectChange(project?.id)

  if (!change) return {}

  return {
    changes: { tone: change, label: t(`activityBar.changes.${change}`) },
  }
}

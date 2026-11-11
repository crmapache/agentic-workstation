import { useState } from 'react'
import { GitBranch, CircleCheck, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { GitChange } from '@shared/git'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from '../ChangesView.module.scss'
import type { ChangeMenuTarget, ProjectChangesProps } from '../ChangesView.types'
import { groupChanges } from '../ChangesView.utils'
import { useGitChanges } from '../../../../state/git-changes.queries'
import { ChangeGroup } from './ChangeGroup'
import { ChangeMenu } from './ChangeMenu'

/**
 * Изменения одного проекта по группам. Пока список читается - пусто; папка не в git, git не
 * ответил и «всё как в коммите» - словами. Список больше предела - строка о том, что он не
 * весь.
 */
export const ProjectChanges = ({ projectId }: ProjectChangesProps) => {
  const { t } = useTranslation()
  const changes = useGitChanges(projectId)
  const [menu, setMenu] = useState<ChangeMenuTarget>(null)

  const handleMenu = (change: GitChange, anchor: HTMLElement) => setMenu({ change, anchor })

  const handleMenuClosed = () => setMenu(null)

  if (changes === undefined) return null

  if (changes.kind === 'notGit') {
    return (
      <EmptyState
        icon={GitBranch}
        title={t('changes.notGitTitle')}
        description={t('changes.notGitText')}
      />
    )
  }

  if (changes.kind === 'failed') {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={t('changes.failedTitle')}
        description={t('changes.failedText')}
      />
    )
  }

  if (changes.files.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title={t('changes.cleanTitle')}
        description={t('changes.cleanText')}
      />
    )
  }

  // Файл ушёл из списка, пока меню было открыто (откатили, закоммитили), - меню уходит с ним.
  const target = menu && changes.files.includes(menu.change) ? menu : null

  return (
    <div className={styles.changes}>
      {groupChanges(changes.files).map((group) => (
        <ChangeGroup key={group.id} projectId={projectId} group={group} onMenu={handleMenu} />
      ))}
      {changes.truncated && (
        <p className={styles.truncated}>
          {t('changes.truncated', { count: changes.files.length })}
        </p>
      )}
      <ChangeMenu projectId={projectId} target={target} onClose={handleMenuClosed} />
    </div>
  )
}

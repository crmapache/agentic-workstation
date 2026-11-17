import { GitBranch, CircleCheck, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { ProjectChangesProps } from '../ChangesView.types'
import { useGitChanges } from '../../../../state/git-changes.queries'
import { ChangeList } from './ChangeList'

/**
 * Изменения одного проекта. Пока список читается - пусто; папка не в git, git не ответил и
 * «всё как в коммите» - словами; иначе - сам список.
 */
export const ProjectChanges = ({ projectId }: ProjectChangesProps) => {
  const { t } = useTranslation()
  const changes = useGitChanges(projectId)

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

  return <ChangeList projectId={projectId} changes={changes} />
}

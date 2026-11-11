import { useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import { useGitActionRunner } from '../git-actions.hooks'
import { useGitDialogsStore } from '../git-dialogs.store'
import { useGitHead, useGitActions } from '../git.queries'
import { BranchMenu } from '../BranchMenu/BranchMenu'
import { GitInputDialog } from '../GitInputDialog/GitInputDialog'
import { PullRequestLink } from '../PullRequestLink/PullRequestLink'
import { PushDialog } from '../PushDialog/PushDialog'
import { useActiveProject } from '../../../state/workspace.queries'
import { BRANCH_ICON_SIZE, BRANCH_ICON_STROKE_WIDTH } from './BranchSwitcher.constants'
import styles from './BranchSwitcher.module.scss'

type BranchSwitcherBodyProps = { projectId: string }

/**
 * Ветка активного проекта в шапке, меню ветки, как в WebStorm, и PR ветки справа от
 * неё. Диалоги (новая ветка, тег или коммит, push) живут здесь, снаружи всплывающей
 * панели: она закрывается при выборе пункта. Папка не репозиторий git - кнопки нет
 * вовсе.
 */
export const BranchSwitcher = () => {
  const project = useActiveProject()

  return project ? <BranchSwitcherBody key={project.id} projectId={project.id} /> : null
}

const BranchSwitcherBody = ({ projectId }: BranchSwitcherBodyProps) => {
  const { t } = useTranslation()
  const { data: head } = useGitHead(projectId)
  const git = useGitActions(projectId)
  const popover = usePopover()
  const dialog = useGitDialogsStore((state) => state.dialog)
  const { run: runAction } = useGitActionRunner(projectId)
  const closeDialog = useGitDialogsStore((state) => state.closeDialog)

  // Диалог принадлежит проекту: сменили проект - открытый диалог прошлого закрывается.
  useEffect(() => closeDialog, [closeDialog])

  if (!head) return null

  const label = head.kind === 'branch' ? head.name : t('git.detached', { commit: head.commit })

  const icon = (
    <GitBranch
      className={styles.icon}
      size={BRANCH_ICON_SIZE}
      strokeWidth={BRANCH_ICON_STROKE_WIDTH}
      aria-hidden
    />
  )

  return (
    <>
      <DropdownButton
        {...popover.triggerProps}
        label={label}
        leading={icon}
        menuLabel={t('git.switcherLabel')}
        disabled={git.isBusy}
      />
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && (
          <BranchMenu
            projectId={projectId}
            head={head}
            onSwitch={(branch, kind) => void git.switchTo(branch, kind)}
            onAction={runAction}
          />
        )}
      </Popover>
      {head.kind === 'branch' && <PullRequestLink projectId={projectId} branch={head.name} />}
      <GitInputDialog
        open={dialog === 'newBranch'}
        title={t('git.newBranchTitle')}
        label={t('git.newBranchName')}
        placeholder={t('git.newBranchPlaceholder')}
        submitLabel={t('git.create')}
        onSubmit={(name) => git.createBranch.mutateAsync(name)}
        onClose={closeDialog}
      />
      <GitInputDialog
        open={dialog === 'checkoutRevision'}
        title={t('git.checkoutRevisionTitle')}
        label={t('git.revision')}
        placeholder={t('git.revisionPlaceholder')}
        submitLabel={t('git.checkout')}
        onSubmit={(revision) => git.checkoutRevision.mutateAsync(revision)}
        onClose={closeDialog}
      />
      <PushDialog
        open={dialog === 'push'}
        projectId={projectId}
        onPush={() => git.push.mutateAsync()}
        onClose={closeDialog}
      />
    </>
  )
}

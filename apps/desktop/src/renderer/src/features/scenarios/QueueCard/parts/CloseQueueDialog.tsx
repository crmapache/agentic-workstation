import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../QueueCard.module.scss'
import type { CloseQueueDialogProps } from '../QueueCard.types'
import { waitingItems } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'
import { useWorktreeFacts } from '../../WorktreeRemoveDialog/WorktreeRemoveDialog.hooks'
import { hasWork } from '../../WorktreeRemoveDialog/WorktreeRemoveDialog.utils'

/**
 * «Close queue?» - закрытая уходит в историю и больше ничего не запускает. Говорит, что
 * пропадёт: ждущие сценарии не пойдут, а worktree с работой останется на своей ветке (пустой
 * уйдёт сам) - иначе после закрытия о нём негде было бы узнать.
 */
export const CloseQueueDialog = ({ queue, onClose }: CloseQueueDialogProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const { workdir } = queue
  const worktree = workdir.kind === 'worktree' && !workdir.removed ? workdir : null
  const facts = useWorktreeFacts(queue.id, worktree !== null)
  const waiting = waitingItems(queue).length

  const handleSubmit = () => {
    onClose()
    void actions.queue(queue.id, { kind: 'close' })
  }

  return (
    <Dialog
      open
      title={t('scenarios.queues.closeDialog.title', { name: queue.name })}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('scenarios.queues.closeDialog.confirm')}
          </Button>
        </>
      }>
      <div className={styles.dialogText}>
        <span>{t('scenarios.queues.closeDialog.text')}</span>
        {waiting > 0 && (
          <span>{t('scenarios.queues.closeDialog.waiting', { count: waiting })}</span>
        )}
        {worktree && facts.isPending && (
          <span className={styles.checking}>
            <Spinner size="sm" tone="neutral" />
            {t('scenarios.queues.closeDialog.checking')}
          </span>
        )}
        {worktree && facts.data && (
          <span>
            {hasWork(facts.data)
              ? t('scenarios.queues.closeDialog.worktreeKept', { branch: worktree.gitBranch })
              : t('scenarios.queues.closeDialog.worktreeDropped')}
          </span>
        )}
      </div>
    </Dialog>
  )
}

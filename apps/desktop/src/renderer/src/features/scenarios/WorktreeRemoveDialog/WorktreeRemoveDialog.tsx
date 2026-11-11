import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { useMutation } from '@tanstack/react-query'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import { useWorktreeFacts } from './WorktreeRemoveDialog.hooks'
import styles from './WorktreeRemoveDialog.module.scss'
import type { WorktreeFactLine, WorktreeRemoveDialogProps } from './WorktreeRemoveDialog.types'
import { factLines } from './WorktreeRemoveDialog.utils'

/**
 * «Remove worktree?» - сначала что в нём сейчас: свои коммиты (ветка их сохранит), правки
 * (пропадут) или ничего. С правками кнопка говорит «Remove anyway» и удаляет силой: человек
 * видел, что теряет. Отказ git встаёт уведомлением, вопрос остаётся - можно передумать.
 */
export const WorktreeRemoveDialog = ({ request }: WorktreeRemoveDialogProps) => {
  const { t } = useTranslation()
  const close = useScenariosStore((state) => state.close)
  const actions = useScenarioActions()
  const { data: view } = useScenarioQueues()
  const facts = useWorktreeFacts(request.queueId)
  const remove = useMutation({
    mutationFn: (force: boolean) => actions.worktree(request.queueId, { kind: 'remove', force }),
    onSuccess: (isRemoved) => {
      if (isRemoved) close()
    },
  })
  const workdir = view?.queues.find((queue) => queue.id === request.queueId)?.workdir
  const isDirty = facts.data?.dirty === true
  const canRemove = facts.data?.exists === true && !remove.isPending

  const handleSubmit = () => {
    if (canRemove) remove.mutate(isDirty)
  }

  const lineWords = (line: WorktreeFactLine): string =>
    line.kind === 'ahead'
      ? t('scenarios.worktree.ahead', { count: line.count })
      : t(`scenarios.worktree.${line.kind}`)

  return (
    <Dialog
      open
      title={t('scenarios.worktree.title')}
      onSubmit={handleSubmit}
      onClose={close}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={!canRemove}>
            {isDirty ? t('scenarios.worktree.removeAnyway') : t('scenarios.worktree.remove')}
          </Button>
        </>
      }>
      <div className={styles.body}>
        {workdir?.kind === 'worktree' && (
          <div className={styles.where}>
            <span className={styles.branch}>{workdir.gitBranch}</span>
            <span className={styles.path}>{workdir.path}</span>
          </div>
        )}
        {facts.isPending ? (
          <span className={styles.checking}>
            <Spinner size="sm" tone="neutral" />
            {t('scenarios.worktree.checking')}
          </span>
        ) : facts.data ? (
          <ul className={styles.facts}>
            {factLines(facts.data).map((line) => (
              <li key={line.kind} className={clsx(line.kind === 'dirty' && styles.loss)}>
                {lineWords(line)}
              </li>
            ))}
          </ul>
        ) : (
          <span>{t('scenarios.worktree.gone')}</span>
        )}
      </div>
    </Dialog>
  )
}

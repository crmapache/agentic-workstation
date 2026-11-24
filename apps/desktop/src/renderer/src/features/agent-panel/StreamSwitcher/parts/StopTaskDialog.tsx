import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import { SHELL_KEYS } from '../StreamSwitcher.constants'
import styles from '../StreamSwitcher.module.scss'
import type { StopTaskDialogProps } from '../StreamSwitcher.types'
import { useStopTask } from '../../agents.queries'

/**
 * «Stop this agent?» / «Stop this command?» перед крестиком на чипе: остановленную
 * работу не вернуть. Ход не трогается; о конце задачи CLI скажет сам, лентой.
 */
export const StopTaskDialog = ({ conversationId, target, onClose }: StopTaskDialogProps) => {
  const { t } = useTranslation()
  const stopTask = useStopTask()
  const title =
    target.kind === 'agent'
      ? 'agentPanel.agents.streams.stopAgentTitle'
      : SHELL_KEYS[target.kind].stopTitle

  const handleSubmit = () => {
    stopTask.mutate({ conversationId, taskId: target.taskId })
    onClose()
  }

  return (
    <Dialog
      open
      title={t(title)}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('agentPanel.agents.streams.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('agentPanel.agents.streams.stop')}
          </Button>
        </>
      }>
      {target.subject && <div className={styles.subject}>{target.subject}</div>}
    </Dialog>
  )
}

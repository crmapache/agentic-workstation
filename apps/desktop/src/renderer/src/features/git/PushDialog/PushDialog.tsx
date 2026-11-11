import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import { usePushInfo } from '../git.queries'
import styles from './PushDialog.module.scss'
import type { PushDialogProps } from './PushDialog.types'
import { canPush, describePush } from './PushDialog.utils'

/**
 * Подтверждение push: какая ветка, куда и сколько коммитов. Отправить без
 * подтверждения нельзя - это действие наружу. Отказ git остаётся в окне.
 */
export const PushDialog = ({ open, projectId, onPush, onClose }: PushDialogProps) => {
  const { t } = useTranslation()
  const { data: info, isPending } = usePushInfo(projectId, open)
  const [error, setError] = useState<string | undefined>()
  const [isRunning, setIsRunning] = useState(false)

  const handleClose = () => {
    setError(undefined)
    onClose()
  }

  const handleSubmit = async () => {
    if (!canPush(info) || isRunning) return

    setIsRunning(true)

    const result = await onPush()

    setIsRunning(false)
    if (result.ok) handleClose()
    else setError(result.details)
  }

  const actions = (
    <>
      <Button variant="ghost" onClick={handleClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" variant="primary" disabled={!canPush(info) || isRunning}>
        {isRunning ? t('git.pushing') : t('git.pushAction')}
      </Button>
    </>
  )

  return (
    <Dialog
      open={open}
      title={t('git.pushTitle')}
      actions={actions}
      onSubmit={handleSubmit}
      onClose={handleClose}>
      {!isPending && <div>{describePush(info, t)}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </Dialog>
  )
}

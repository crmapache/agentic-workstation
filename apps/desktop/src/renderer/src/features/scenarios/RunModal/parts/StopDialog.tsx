import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../RunModal.module.scss'
import type { StopDialogProps } from '../RunModal.types'

/**
 * «Stop the run?» перед стопом: карточка, что работает сейчас, обрывается, этапы после неё не
 * случатся. Подхватить прогон потом можно, но оборванная карточка начнёт заново.
 */
export const StopDialog = ({ subject, onStop, onClose }: StopDialogProps) => {
  const { t } = useTranslation()

  return (
    <Dialog
      open
      title={t('scenarios.run.stopTitle')}
      onSubmit={onStop}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger">
            {t('scenarios.run.stop')}
          </Button>
        </>
      }>
      <div className={styles.stopSubject}>{subject}</div>
      <div className={styles.stopNote}>{t('scenarios.run.stopNote')}</div>
    </Dialog>
  )
}

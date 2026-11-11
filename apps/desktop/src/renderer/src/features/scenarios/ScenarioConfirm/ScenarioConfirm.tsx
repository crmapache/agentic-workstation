import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from './ScenarioConfirm.module.scss'
import type { ScenarioConfirmProps } from './ScenarioConfirm.types'

/**
 * Вопрос перед необратимым в виде сценариев (Confirm в ACC): удалить сценарий, прогон или час
 * расписания, выбросить правку. Один на все вкладки: вопрос, что уходит и что из этого выйдет,
 * кнопка «да» - красная, Enter подтверждает, Esc отменяет.
 */
export const ScenarioConfirm = ({
  open,
  title,
  subject,
  note,
  submit,
  onSubmit,
  onClose,
}: ScenarioConfirmProps) => {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      title={title}
      onSubmit={onSubmit}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger">
            {submit}
          </Button>
        </>
      }>
      <div className={styles.body}>
        {subject && <div className={styles.subject}>{subject}</div>}
        <div>{note}</div>
      </div>
    </Dialog>
  )
}

import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'

import { useSourceForm } from './SourceModal.hooks'
import styles from './SourceModal.module.scss'
import type { SourceModalProps } from './SourceModal.types'
import { AiFields } from './parts/AiFields'
import { CommonFields } from './parts/CommonFields'
import { KindFields } from './parts/KindFields'
import { KindPicker } from './parts/KindPicker'

/**
 * Источник календаря окном по центру: откуда звонки (Google, ICS, ИИ в браузере, ИИ по экрану),
 * имя и цвет, поля вида и, у чтения ИИ, кто читает. Пояснения - за «?» в шапке.
 */
export const SourceModal = ({ sourceId }: SourceModalProps) => {
  const { t } = useTranslation()
  const { form, source, change, problem, saving, failure, close, submit } = useSourceForm(sourceId)
  const title = t(source ? 'calendar.form.editTitle' : 'calendar.form.newTitle')
  const isAi = form.kind === 'ai-browser' || form.kind === 'ai-screen'

  return (
    <Modal
      open
      icon={CalendarDays}
      title={title}
      description={source?.name}
      headerActions={
        <HelpButton
          label={t('calendar.form.help.label')}
          title={title}
          text={t(`calendar.form.help.${form.kind}`)}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          {(failure || problem) && (
            <span className={failure ? styles.failure : styles.problem}>
              {failure
                ? t(`calendar.form.failures.${failure}` as never)
                : t(`calendar.form.problems.${problem ?? 'name'}`)}
            </span>
          )}
          <div className={styles.footerEnd}>
            <Button variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={problem !== null || saving}
              onClick={() => void submit()}>
              {t(source ? 'calendar.form.save' : 'calendar.form.add')}
            </Button>
          </div>
        </div>
      }
      closeLabel={t('common.close')}
      onClose={close}>
      <div className={styles.body}>
        {!source && <KindPicker form={form} onChange={change} />}
        <CommonFields form={form} onChange={change} />
        <KindFields form={form} onChange={change} editing={source !== null} />
        {isAi && <AiFields form={form} onChange={change} />}
      </div>
    </Modal>
  )
}

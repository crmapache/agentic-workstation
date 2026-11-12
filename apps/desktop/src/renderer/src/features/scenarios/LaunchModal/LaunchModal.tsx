import type { FormEvent, KeyboardEvent } from 'react'
import { useId } from 'react'
import { Play, FilePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useScenariosStore } from '../scenarios.store'
import { useLaunchForm } from './LaunchModal.hooks'
import styles from './LaunchModal.module.scss'
import type { LaunchModalProps } from './LaunchModal.types'
import { askedInputs } from './LaunchModal.utils'
import { InputFields } from './parts/InputFields'
import { LaunchFailureLine } from './parts/LaunchFailureLine'
import { ProviderPicker } from './parts/ProviderPicker'
import { ScenarioPicker } from './parts/ScenarioPicker'
import { WherePicker } from './parts/WherePicker'

/**
 * «Run scenario» окном по центру: сценарий, ответы на его вопросы, провайдер, куда - новая
 * очередь (по желанию в своём worktree) или открытая очередь проекта. ⌘Enter запускает из
 * любого поля: ответы многострочные, и Enter в них - перенос строки.
 */
export const LaunchModal = ({ project, request }: LaunchModalProps) => {
  const { t } = useTranslation()
  const formId = useId()
  const form = useLaunchForm(project, request)
  const open = useScenariosStore((state) => state.open)
  const isAsking = form.scenario !== null && askedInputs(form.scenario).length > 0

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    form.submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return

    event.preventDefault()
    form.submit()
  }

  const handleAuthor = () => open({ kind: 'author' })

  return (
    <Modal
      open
      size="md"
      icon={Play}
      iconTone="accent"
      title={t('scenarios.launch.title')}
      description={project.name}
      closeLabel={t('common.close')}
      onClose={form.close}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={form.close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={Play} disabled={!form.canRun}>
            {form.target.kind === 'new' ? t('scenarios.launch.run') : t('scenarios.launch.add')}
          </Button>
        </div>
      }>
      {form.isReading ? (
        <span className={styles.reading}>
          <Spinner size="sm" tone="neutral" />
          {t('scenarios.launch.loading')}
        </span>
      ) : form.scenarios.length === 0 ? (
        <EmptyState
          icon={FilePlus}
          title={t('scenarios.launch.emptyTitle')}
          description={t('scenarios.launch.emptyText')}
          action={<Button onClick={handleAuthor}>{t('scenarios.launch.newScenario')}</Button>}
        />
      ) : (
        <form id={formId} className={styles.form} onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <ScenarioPicker form={form} />
          {isAsking && <InputFields form={form} />}
          <ProviderPicker form={form} />
          <WherePicker form={form} />
          {form.failure && <LaunchFailureLine failure={form.failure} />}
        </form>
      )}
    </Modal>
  )
}

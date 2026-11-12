import { WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import { draftErrorCode } from '../scenarios-forms.utils'
import { ScenarioAlert } from '../ScenarioAlert/ScenarioAlert'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioShelves } from '../../../state/scenarios.queries'
import { useScenarioDraft } from './AuthorModal.hooks'
import styles from './AuthorModal.module.scss'
import { ChoiceRows } from './parts/ChoiceRows'
import { DraftWait } from './parts/DraftWait'

/**
 * Новый сценарий начинается с фразы (NewScenarioForm в ACC): описать круг работ может кто
 * угодно, а заполнить этапы с карточками и слотами - почти никто. Рядом «соберу сам» - пустой
 * редактор. Пока модель пишет, поле не принимает нажатий, под ним идут полоса и часы, а Cancel
 * отменяет запрос.
 */
export const AuthorModal = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  // Пока полки не пришли, проектную не запрещаем: отказ, если что, скажет главный процесс.
  const canShare = useScenarioShelves(project.id).data?.canShare ?? true
  const draft = useScenarioDraft(project.id, canShare)
  const { form } = draft
  const isDrafting = form.drafting !== null
  const errorCode = draftErrorCode(form.error)
  const shelves = [
    {
      id: 'project' as const,
      label: t('scenarios.author.inRepository'),
      note: canShare ? t('scenarios.author.inRepositoryNote') : t('scenarios.author.noRepository'),
      disabled: !canShare,
    },
    {
      id: 'user' as const,
      label: t('scenarios.author.everyProject'),
      note: t('scenarios.author.everyProjectNote'),
    },
  ]

  return (
    <Modal
      open
      icon={WandSparkles}
      title={t('scenarios.author.title')}
      description={isDrafting ? t('scenarios.author.reading') : t('scenarios.author.description')}
      headerActions={
        <HelpButton
          label={t('scenarios.author.help.label')}
          title={t('scenarios.author.title')}
          text={t('scenarios.author.help.text')}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          {isDrafting ? (
            <Button variant="ghost" onClick={draft.cancel}>
              {t('common.cancel')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={draft.byHand}>
                {t('scenarios.author.byHand')}
              </Button>
              <Button variant="primary" disabled={!form.description.trim()} onClick={draft.write}>
                {t('scenarios.author.write')}
              </Button>
            </>
          )}
        </div>
      }
      closeLabel={t('common.close')}
      onClose={draft.leave}>
      <div className={styles.body}>
        <div className={styles.section}>
          {/* Enter здесь - перевод строки: круг работ описывают абзацами, отправляет кнопка. */}
          <TextArea
            label={t('scenarios.author.what')}
            value={form.description}
            placeholder={t('scenarios.author.placeholder')}
            disabled={isDrafting}
            spellCheck={false}
            data-autofocus
            onChange={draft.describe}
          />
          {form.drafting && <DraftWait since={form.drafting.since} />}
        </div>
        {form.error && !isDrafting && (
          <ScenarioAlert tone="danger" alert>
            {errorCode
              ? t(`scenarios.author.errors.${errorCode}`)
              : t('scenarios.author.failed', { error: form.error })}
          </ScenarioAlert>
        )}
        <ChoiceRows
          label={t('scenarios.author.keptIn')}
          items={shelves}
          value={draft.scope}
          disabled={isDrafting}
          onChange={draft.choose}
        />
      </div>
    </Modal>
  )
}

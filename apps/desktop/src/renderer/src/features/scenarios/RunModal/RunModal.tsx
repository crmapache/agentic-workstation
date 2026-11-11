import { SearchX, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunStep } from '@shared/scenario-runs'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useScenariosStore } from '../scenarios.store'
import { ScenarioNotice } from '../ScenarioNotice/ScenarioNotice'
import { ScenarioStepLog } from '../ScenarioStepLog/ScenarioStepLog'
import { HEAD_LOG } from '../ScenarioStepLog/ScenarioStepLog.constants'
import { logSubject } from '../ScenarioStepLog/ScenarioStepLog.utils'
import { ScenarioTellField } from '../ScenarioTellField/ScenarioTellField'
import { useScenarioRun } from '../../../state/scenarios.queries'
import { useRunPage, useQueueName } from './RunModal.hooks'
import styles from './RunModal.module.scss'
import type { RunModalProps } from './RunModal.types'
import { runDescription } from './RunModal.utils'
import { RunActions } from './parts/RunActions'
import { RunPage } from './parts/RunPage'

/**
 * Окно прогона (вкладка прогона в ACC, здесь - Modal lg вида сценариев, ADR 0030): шапка с
 * паузой, стопом и продолжением, строка цифр, вопрос, таймлайн и поле главному потоку внизу; на
 * месте таймлайна - журнал шага или разговор главного потока. Запись прогона держит кэш (событие
 * scenarios:run приносит свежую, пока окно открыто), что открыто внутри - само окно.
 */
export const RunModal = ({ request }: RunModalProps) => {
  const { t } = useTranslation()
  const close = useScenariosStore((state) => state.close)
  const { data, isLoading } = useScenarioRun(request.place, request.runId)
  const run = data ?? null
  const queueName = useQueueName(run?.queueId)
  const { logKey, rootRef, openLog, back } = useRunPage(run)
  // Поле главному потоку - под таймлайном и под его же разговором; в журнале карточки - нет.
  const isTelling = run !== null && (logKey === null || logKey === HEAD_LOG)
  const description = run
    ? logKey === null
      ? runDescription(queueName, run.inputs)
      : logSubject(t, run, logKey)
    : undefined

  const handleOpenLog = (step: RunStep) => openLog(step.key)

  const handleMainThread = () => openLog(HEAD_LOG)

  return (
    <Modal
      open
      size="lg"
      icon={Workflow}
      title={run?.scenarioName ?? t('scenarios.run.loading')}
      description={description || undefined}
      headerActions={
        run && (
          <RunActions
            place={request.place}
            run={run}
            logKey={logKey}
            onMainThread={handleMainThread}
            onBack={back}
          />
        )
      }
      footer={isTelling && run ? <ScenarioTellField place={request.place} run={run} /> : undefined}
      closeLabel={t('common.close')}
      onClose={close}>
      <div className={styles.body}>
        {/* Угол окна IDE под модальным окном затемнён и не нажимается: отказ (не подхватился,
            слова не ушли) показывается здесь же - то же уведомление, тот же стор. */}
        <ScenarioNotice />
        {run ? (
          logKey !== null ? (
            <ScenarioStepLog key={logKey} place={request.place} run={run} logKey={logKey} />
          ) : (
            <RunPage ref={rootRef} place={request.place} run={run} onOpenLog={handleOpenLog} />
          )
        ) : isLoading ? (
          <div className={styles.waiting}>
            <Spinner size="sm" tone="neutral" />
            {t('scenarios.run.loading')}
          </div>
        ) : (
          <EmptyState
            icon={SearchX}
            title={t('scenarios.run.missing')}
            description={t('scenarios.run.missingHint')}
          />
        )}
      </div>
    </Modal>
  )
}

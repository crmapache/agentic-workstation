import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { isStepOver } from '@shared/scenario-runs'

import styles from '../ScenarioRunTimeline.module.scss'
import type { StepOutcomeProps } from '../ScenarioRunTimeline.types'
import { Glance } from './Glance'

/**
 * Что вышло из шага, под его строкой: вердикт головы (сделано - зелёным, не сделано - красным,
 * отложен до конца списка - жёлтым) с её причиной - Markdown, как всё, что она пишет; что она
 * передала дальше; возвраты на доработку; работу забрала голова; ошибка движка - как есть.
 */
export const StepOutcome = ({ step }: StepOutcomeProps) => {
  const { t } = useTranslation()
  const isUndone = step.verdict === 'undone'
  // У «не сделано» движок кладёт ту же причину и в ошибку - дважды её не пишем.
  const error = step.error && step.error !== step.verdictReason ? step.error : ''

  return (
    <>
      {step.verdict === 'done' && (
        <div className={clsx(styles.verdict, styles.verdictDone)}>
          {t('scenarios.run.step.meetsDone')}
        </div>
      )}
      {step.verdict === 'later' && (
        <div className={clsx(styles.verdict, styles.verdictLater)}>
          {t('scenarios.run.step.later')}
        </div>
      )}
      {step.verdictReason && (
        <div className={clsx(styles.reason, isUndone && styles.verdictUndone)}>
          <Glance text={step.verdictReason} />
        </div>
      )}
      {step.handoff && (
        <div className={styles.handoff}>
          <span className={styles.handoffLabel}>{t('scenarios.run.step.handoff')}</span>
          <Glance text={step.handoff} isClamped />
        </div>
      )}
      {step.nudges.map((nudge, index) => (
        <div key={index} className={styles.nudge}>
          {t('scenarios.run.step.sentBack', { reason: nudge })}
        </div>
      ))}
      {step.takeOver && (
        <div className={styles.nudge}>
          {t('scenarios.run.step.takenOver', { reason: step.takeOver })}
          {!isStepOver(step.state) && (
            <span className={styles.finishing}>{t('scenarios.run.step.finishing')}</span>
          )}
        </div>
      )}
      {error && <div className={styles.stepError}>{error}</div>}
    </>
  )
}

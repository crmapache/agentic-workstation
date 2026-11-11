import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { isStepBegun } from '@shared/scenario-runs'

import { Badge } from '@agentic-workstation/ui/Badge'

import { RUN_ROW } from '../ScenarioRunTimeline.constants'
import styles from '../ScenarioRunTimeline.module.scss'
import type { StepRowProps } from '../ScenarioRunTimeline.types'
import { isGoing, stepLineOf, stepToneOf, filledSlots } from '../ScenarioRunTimeline.utils'
import { formatDuration } from '../../scenarios-format.utils'
import { itemLabelOf, stepPlaceWords } from '../../scenarios-run.utils'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'
import { Glance } from './Glance'
import { StepOutcome } from './StepOutcome'

/**
 * Шаг прогона карточкой: имя, плашка, место в этапе (проход, пункт), время работы, строка того,
 * что агент говорит или чем кончил, и вердикт головы. Шаг со своим разговором открывает журнал
 * нажатием по всей карточке, а метка Log - только знак: кнопка в кнопке нажимала бы не то.
 * Строки впереди - пунктиром: план, а не пропуск.
 */
export const StepRow = ({ row, worked, onOpenLog }: StepRowProps) => {
  const { t } = useTranslation()
  const { step } = row
  const isAhead = !isStepBegun(step.state)
  const going = isGoing(step.state)
  const opens = step.conversationId.length > 0
  const where = stepPlaceWords(t, step, row)
  const item = itemLabelOf(step)
  const line = stepLineOf(step)
  const slots = filledSlots(step.slots)
  // Строка «пустой список» уже сказала, чем кончилось: «not yet» под ней было бы неправдой.
  const time =
    step.startedAt > 0
      ? formatDuration(worked)
      : isAhead && step.item?.count !== 0
        ? t('scenarios.run.step.notYet')
        : ''

  const handleOpen = () => onOpenLog(step)

  return (
    <div className={styles.row} {...{ [RUN_ROW]: row.key }}>
      <span className={styles.rail}>
        <span className={clsx(styles.dot, styles[stepToneOf(step.state)])} />
      </span>
      <div
        className={clsx(
          styles.step,
          isAhead && styles.stepAhead,
          going && styles.stepGoing,
          step.state === 'asking' && styles.stepAsking,
          step.state === 'failed' && styles.stepFailed,
        )}>
        {opens && (
          <button
            type="button"
            className={styles.door}
            aria-label={t('scenarios.run.step.openLog', { title: step.title })}
            onClick={handleOpen}
          />
        )}
        <div className={styles.stepBody}>
          <div className={styles.stepHead}>
            <span className={styles.stepTitle}>{step.title}</span>
            {!isAhead && <ScenarioStatePill of="step" state={step.state} />}
            {where && <span className={styles.stepPlace}>{where}</span>}
            <span className={styles.spacer} />
            {opens && <Badge variant="soft">{t('scenarios.run.step.log')}</Badge>}
            {time && (
              <span className={clsx(styles.stepTime, going && styles.stepTimeGoing)}>{time}</span>
            )}
          </div>
          {item && <div className={styles.stepItem}>{item}</div>}
          {slots.length > 0 && (
            <div className={styles.slots}>
              {slots.map(([name, value]) => (
                <span key={name} className={styles.slot}>{`${name}: ${value}`}</span>
              ))}
            </div>
          )}
          {line.trim() && (
            <div className={clsx(styles.stepLine, going && step.said && styles.stepSaying)}>
              <Glance text={line} isClamped isNewest={going && Boolean(step.said)} />
            </div>
          )}
          <StepOutcome step={step} />
        </div>
      </div>
    </div>
  )
}

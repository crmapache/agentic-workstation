import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunWire, RunStepWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../RunScreen.module.scss'
import { begun, stagesOf, stepWords } from '../RunScreen.utils'
import { STEP_TONES } from '../../../../lib/status.constants'
import { costText } from '../../../../lib/time.utils'

/** Шаг дорожки: заголовок с состоянием, итог по нажатию и журнал карточки - у начатого шага. */
const Step = ({ step, onOpenLog }: { step: RunStepWire; onOpenLog: (key: string) => void }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const words = stepWords(step)

  return (
    <div className={styles.step}>
      <div className={styles.stepRow}>
        <div className={styles.stepMain}>
          <Disclosure
            size="touch"
            expanded={isOpen}
            disabled={!words}
            onClick={() => setIsOpen((open) => !open)}>
            <span className={styles.stepTitle}>
              {step.pass > 1 ? t('run.pass', { title: step.title, pass: step.pass }) : step.title}
            </span>
            {step.cost > 0 && <span className={styles.stepCost}>{costText(step.cost)}</span>}
            <Badge tone={STEP_TONES[step.state] ?? 'neutral'}>
              {t(`stepState.${step.state}`, { defaultValue: step.state })}
            </Badge>
          </Disclosure>
        </div>
        {begun(step) && (
          <IconButton
            icon={ScrollText}
            size="touch"
            label={t('run.openLog')}
            onClick={() => onOpenLog(step.key)}
          />
        )}
      </div>
      {isOpen && words && <p className={styles.stepWords}>{words}</p>}
    </div>
  )
}

/**
 * Дорожка прогона: этапы по порядку, под каждым - его шаги с состоянием и итогом; у начатого
 * шага - его журнал (разговор карточки).
 */
export const RunSteps = ({
  run,
  onOpenLog,
}: {
  run: RunWire
  onOpenLog: (key: string) => void
}) => {
  const { t } = useTranslation()
  const stages = stagesOf(run)

  return (
    <Section
      size="sm"
      title={t('run.roadmap')}
      description={stages.length === 0 ? t('run.noSteps') : undefined}>
      <div className={styles.stages}>
        {stages.map((stage) => (
          <div key={stage.id} className={styles.stage}>
            <h4 className={styles.stageTitle}>{stage.title}</h4>
            {stage.steps.length === 0 ? (
              <p className={styles.muted}>{t('run.stageWaiting')}</p>
            ) : (
              stage.steps.map((step) => <Step key={step.key} step={step} onOpenLog={onOpenLog} />)
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

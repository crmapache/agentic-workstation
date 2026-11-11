import { useTranslation } from 'react-i18next'

import type { ScenarioWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ScenarioView.module.scss'
import { runFacts, headRules } from '../ScenarioView.utils'
import { Markdown } from '../../../../shell/Markdown/Markdown'

/** Голова сценария: её задание, на чём она работает и что делает с вопросами карточек. */
export const HeadSection = ({ head }: { head: ScenarioWire['head'] }) => {
  const { t } = useTranslation()
  const facts = runFacts(t, head)

  return (
    <Section size="sm" title={t('scenario.head.title')}>
      <div className={styles.block}>
        {head.briefing ? (
          <div className={styles.text}>
            <Markdown text={head.briefing} />
          </div>
        ) : (
          <p className={styles.muted}>{t('scenario.head.noBriefing')}</p>
        )}
        {facts && <p className={styles.fact}>{facts}</p>}
        <p className={styles.fact}>{headRules(t, head)}</p>
      </div>
    </Section>
  )
}

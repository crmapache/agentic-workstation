import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ScenarioCardWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import styles from '../ScenarioView.module.scss'
import { runFacts } from '../ScenarioView.utils'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Карточка этапа строкой; по нажатию - её промпт как есть (метки папок приглушены), чем она
 * считается сделанной, что голова делает после неё и на чём она работает.
 */
export const CardItem = ({ card }: { card: ScenarioCardWire }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const facts = runFacts(t, card)

  return (
    <div className={styles.card}>
      <Disclosure size="touch" expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span className={styles.cardTitle}>{card.title || t('scenario.untitledCard')}</span>
      </Disclosure>
      {isOpen && (
        <div className={styles.cardBody}>
          <pre className={styles.prompt}>
            <PathText text={card.prompt || t('scenario.noPrompt')} />
          </pre>
          {card.dod && (
            <p className={styles.fact}>
              <span className={styles.factLabel}>{t('scenario.card.dod')}</span>
              <PathText text={card.dod} />
            </p>
          )}
          {card.after && (
            <p className={styles.fact}>
              <span className={styles.factLabel}>{t('scenario.card.after')}</span>
              <PathText text={card.after} />
            </p>
          )}
          {facts && <p className={styles.fact}>{facts}</p>}
        </div>
      )}
    </div>
  )
}

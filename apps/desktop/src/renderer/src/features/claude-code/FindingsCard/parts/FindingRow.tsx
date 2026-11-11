import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { OUTCOME_KEYS } from '../FindingsCard.constants'
import styles from '../FindingsCard.module.scss'
import type { FindingRowProps } from '../FindingsCard.types'
import { findingPlace } from '../FindingsCard.utils'
import { Markdown } from '../../Markdown/Markdown'

/**
 * Одна находка: место и метки в шапке, утверждение всегда видно, доказательство - по
 * нажатию. Свёрнута по умолчанию: доказательство длиннее всего, и ревью из десяти
 * находок иначе похоронило бы под собой разговор.
 */
export const FindingRow = ({ finding }: FindingRowProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const outcome = finding.outcome

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <div className={styles.finding}>
      <Disclosure expanded={isOpen} onClick={handleToggle}>
        <span className={styles.place}>{findingPlace(finding)}</span>
        {finding.category && <span className={styles.tag}>{finding.category}</span>}
        {/* PLAUSIBLE - проверка не подтвердила: читать это как установленный факт и есть ошибка. */}
        {finding.verdict === 'PLAUSIBLE' && (
          <span className={styles.maybe}>{t('claudeCode.agents.findings.unconfirmed')}</span>
        )}
        {outcome && (
          <span className={clsx(styles.tag, outcome === 'fixed' ? styles.fixed : styles.skipped)}>
            {t(OUTCOME_KEYS[outcome])}
          </span>
        )}
      </Disclosure>
      <div className={styles.summary}>
        <Markdown text={finding.shortSummary ?? finding.summary} />
      </div>
      {isOpen && (
        <div className={styles.details}>
          {/* Путь целиком: в шапке только имя, а два файла с одним именем различимы лишь здесь. */}
          <div className={styles.file}>
            {finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`}
          </div>
          {finding.shortSummary && <Markdown text={finding.summary} />}
          <Markdown text={finding.failureScenario} />
        </div>
      )}
    </div>
  )
}

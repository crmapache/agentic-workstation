import { useTranslation } from 'react-i18next'

import styles from './FindingsCard.module.scss'
import type { FindingsCardProps } from './FindingsCard.types'
import { FindingRow } from './parts/FindingRow'

/**
 * Находки код-ревью карточкой «REVIEW · N findings» вместо стены JSON, в которой не видно
 * ни числа, ни файла. Порядок ответов - сколько, где, и только потом почему: число в
 * шапке, место и утверждение в строке, доказательство по нажатию. Порядок - самого ревью.
 */
export const FindingsCard = ({ findings }: FindingsCardProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.findingsCard}>
      <div className={styles.head}>
        <span className={styles.label}>{t('agentPanel.agents.findings.label')}</span>
        <span className={styles.count}>
          {t('agentPanel.agents.findings.count', { count: findings.length })}
        </span>
      </div>
      <div className={styles.body}>
        {findings.map((finding, index) => (
          <FindingRow key={`${finding.file}:${finding.line ?? ''}:${index}`} finding={finding} />
        ))}
      </div>
    </div>
  )
}

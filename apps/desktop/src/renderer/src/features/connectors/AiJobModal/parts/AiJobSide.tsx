import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import styles from '../AiJobModal.module.scss'
import type { AiJobSideProps } from '../AiJobModal.types'
import viewStyles from '../../ConnectorsView/ConnectorsView.module.scss'
import { AiSpecReview } from '../../ConnectorsView/parts/AiSpecReview'
import { AiExistingReview } from './AiExistingReview'
import { AiMcpReview } from './AiMcpReview'

/**
 * Правая колонка окна работы: что ИИ предлагает добавить - с проверкой, ключом и кнопкой, - и
 * просьба, с которой всё началось. Новое предложение того же вида встаёт на место прежнего, не
 * стирая введённый ключ; адрес MCP или сервер Claude Code другой - форма заново.
 */
export const AiJobSide = ({ job, onAdded }: AiJobSideProps) => {
  const { t } = useTranslation()
  const { proposal, request } = job
  const facts = [
    { key: 'service', value: request.service },
    { key: 'goal', value: request.goal.trim() },
    { key: 'docs', value: request.docsUrl },
  ] as const

  return (
    <div className={styles.side}>
      <Section size="sm" title={t('connectors.ai.side.result')}>
        {!proposal && (
          <p className={viewStyles.hint}>
            {t(job.status === 'working' ? 'connectors.ai.side.pending' : 'connectors.ai.side.none')}
          </p>
        )}
        {proposal?.kind === 'http' && (
          <AiSpecReview proposal={proposal} request={request} onAdded={onAdded} />
        )}
        {proposal?.kind === 'mcp' && (
          <AiMcpReview key={proposal.url} proposal={proposal} job={job} onAdded={onAdded} />
        )}
        {proposal?.kind === 'existing' && (
          <AiExistingReview key={proposal.candidate.key} proposal={proposal} onAdded={onAdded} />
        )}
      </Section>
      <Section size="sm" title={t('connectors.ai.side.request')}>
        {facts.map(
          ({ key, value }) =>
            value && (
              <div key={key} className={viewStyles.fact}>
                <span className={viewStyles.factLabel}>{t(`connectors.ai.side.facts.${key}`)}</span>
                <span className={styles.factValue}>{value}</span>
              </div>
            ),
        )}
      </Section>
    </div>
  )
}

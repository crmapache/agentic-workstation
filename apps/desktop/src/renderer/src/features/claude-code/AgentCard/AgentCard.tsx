import { memo, useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { agentType, isWorkflow, agentDescription } from '../agents.utils'
import { AgentLog } from '../AgentLog/AgentLog'
import styles from './AgentCard.module.scss'
import type { AgentCardProps } from './AgentCard.types'
import { hasBody, errandOf } from './AgentCard.utils'
import { AgentDuration } from './parts/AgentDuration'

/**
 * Запуск субагента или флота workflow строкой разговора: чип AGENT или WORKFLOW, тип,
 * поручение и тикающее время. Свёрнута всегда, даже живая: смотреть агента в работе -
 * дело чипа потока над лентой; раскрытая - задание целиком и журнал агента с отчётом.
 */
export const AgentCard = memo(({ tool, steps }: AgentCardProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const canOpen = hasBody(tool, steps)
  const errand = errandOf(tool)
  const isFailed = tool.status === 'error' || tool.status === 'denied'

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <div className={styles.agentCard}>
      <Disclosure expanded={isOpen && canOpen} disabled={!canOpen} onClick={handleToggle}>
        <span className={clsx(styles.chip, isFailed && styles.chipFailed)}>
          {isWorkflow(tool)
            ? t('claudeCode.agents.chipWorkflow')
            : t('claudeCode.agents.chipAgent')}
        </span>
        <span className={clsx(styles.type, isFailed && styles.failed)}>{agentType(tool, t)}</span>
        {/* Поручение стоит в шапке и пока агент работает: «чем он занят» - единственное, что
            стоит читать в ряду из нескольких агентов; что он идёт, говорит тикающее время. */}
        <span className={styles.description}>{agentDescription(tool)}</span>
        <AgentDuration tool={tool} />
      </Disclosure>
      {isOpen && canOpen && (
        <div className={styles.body}>
          {errand && (
            <section className={styles.errand}>
              <div className={styles.caption}>{t('claudeCode.agents.errand')}</div>
              <div className={styles.prompt}>{errand}</div>
            </section>
          )}
          <AgentLog tool={tool} steps={steps} />
        </div>
      )}
    </div>
  )
})

AgentCard.displayName = 'AgentCard'

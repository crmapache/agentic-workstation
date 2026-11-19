import { useTranslation } from 'react-i18next'

import { useNow } from '../clock.hooks'
import { TICK_MS } from '../panel.constants'
import styles from './WorkflowRun.module.scss'
import type { WorkflowRunProps } from './WorkflowRun.types'
import { FleetAgentLine } from './parts/FleetAgentLine'

/**
 * Что внутри workflow: фазы и в них агенты флота, по строке на агента - видеть девять
 * разом важнее, чем по карточке на каждого. События агентов флота в поток не приходят,
 * всё это - из отчёта CLI. Нажатие на агента открывает его окно с тем, что он сказал.
 */
export const WorkflowRun = ({ tool, fleet }: WorkflowRunProps) => {
  const { t } = useTranslation()
  const live = tool.status === 'running'
  const now = useNow(live && fleet.running > 0, TICK_MS)

  return (
    <div className={styles.workflowRun}>
      <div className={styles.head}>
        <span>{t('agentPanel.agents.fleet.agents', { count: fleet.total })}</span>
        <span className={styles.counts}>
          {live && fleet.running > 0 && (
            <span className={styles.running}>
              {t('agentPanel.agents.fleet.running', { count: fleet.running })}
            </span>
          )}
          {fleet.done > 0 && (
            <span>{t('agentPanel.agents.fleet.done', { count: fleet.done })}</span>
          )}
          {fleet.failed > 0 && (
            <span className={styles.failed}>
              {t('agentPanel.agents.fleet.failed', { count: fleet.failed })}
            </span>
          )}
        </span>
      </div>
      {fleet.phases.map((phase, index) => (
        <div key={phase.index ?? `loose-${index}`} className={styles.phase}>
          {/* Безымянная группа - агенты вне phase(): придуманный заголовок назвал бы то, чего скрипт не называл. */}
          {phase.title && <div className={styles.phaseTitle}>{phase.title}</div>}
          {phase.agents.map((agent) => (
            <FleetAgentLine
              key={agent.index}
              agent={agent}
              itemId={tool.id}
              live={live}
              now={now}
            />
          ))}
        </div>
      ))}
      {/* Строки log() скрипта - под агентами: «12 of 40 found» читается, когда видны сорок. */}
      {fleet.log.map((line, index) => (
        <div key={index} className={styles.log}>
          {line}
        </div>
      ))}
    </div>
  )
}

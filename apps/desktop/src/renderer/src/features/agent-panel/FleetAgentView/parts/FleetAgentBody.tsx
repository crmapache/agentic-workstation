import { useTranslation } from 'react-i18next'

import styles from '../FleetAgentView.module.scss'
import type { FleetAgentBodyProps } from '../FleetAgentView.types'
import { useFleetTranscript } from '../../agents.queries'
import { FleetSection } from './FleetSection'

/**
 * Тело окна агента флота. Транскрипт с диска важнее превью из отчёта: отчёт режет
 * задание и ответ до 400 символов, а у агента со схемой это скобка его JSON. Пока файла
 * нет - на экране превью, и окно говорит, что это оно.
 */
export const FleetAgentBody = ({ conversationId, agent }: FleetAgentBodyProps) => {
  const { t } = useTranslation()
  const { data, isLoading } = useFleetTranscript(conversationId, agent.agentId, agent.state)
  const transcript = data?.found ? data : null
  const prompt = transcript?.prompt || agent.prompt
  const output = transcript?.output || agent.result
  const steps = transcript?.steps ?? []

  return (
    <div className={styles.body}>
      {agent.error && <div className={styles.error}>{agent.error}</div>}
      {prompt && <FleetSection caption={t('agentPanel.agents.errand')} text={prompt} />}
      {steps.length > 0 && (
        <section className={styles.section}>
          <div className={styles.caption}>{t('agentPanel.agents.fleet.steps')}</div>
          <div className={styles.steps}>
            {steps.map((step, index) => (
              <div key={index} className={styles.step}>
                {step}
              </div>
            ))}
          </div>
        </section>
      )}
      {output && <FleetSection caption={t('agentPanel.agents.fleet.returned')} text={output} />}
      {transcript?.truncated && (
        <div className={styles.note}>{t('agentPanel.agents.fleet.cut')}</div>
      )}
      {data && !data.found && (
        <div className={styles.note}>{t('agentPanel.agents.fleet.noTranscript')}</div>
      )}
      {isLoading && !output && (
        <div className={styles.note}>{t('agentPanel.agents.fleet.reading')}</div>
      )}
    </div>
  )
}

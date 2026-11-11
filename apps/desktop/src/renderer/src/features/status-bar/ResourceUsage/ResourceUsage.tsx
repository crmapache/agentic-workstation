import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useResourceUsage } from '../status-bar.queries'
import styles from './ResourceUsage.module.scss'
import { formatMemory } from './ResourceUsage.utils'

/**
 * Процессор и память, которые IDE занимает прямо сейчас, - все её процессы вместе.
 * Цифры те же, что в «Мониторинге системы». Память не измерилась - виден только процессор.
 */
export const ResourceUsage = () => {
  const { t } = useTranslation()
  const { data: usage } = useResourceUsage()

  if (!usage) return null

  const memory = usage.memoryBytes === null ? null : formatMemory(usage.memoryBytes)

  return (
    <Tooltip label={t('statusBar.usageHint')} placement="top">
      <span className={styles.usage}>
        <span className={styles.metric}>
          {t('statusBar.cpu')}
          <span className={styles.value}>
            {t('statusBar.cpuValue', { value: Math.round(usage.cpuPercent) })}
          </span>
        </span>
        {memory && (
          <span className={styles.metric}>
            {t('statusBar.memory')}
            <span className={styles.value}>
              {t(`statusBar.memoryValue.${memory.unit}`, { value: memory.value })}
            </span>
          </span>
        )}
      </span>
    </Tooltip>
  )
}

import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import styles from '../StatisticsView.module.scss'
import type { ScanProgressProps } from '../StatisticsView.types'
import { formatBytes, formatCount } from '../../statistics-format.utils'

/**
 * Первое чтение транскриптов (их бывают гигабайты): полоса по прочитанным байтам и строка,
 * сколько сделано, - числа ниже ещё растут. Дочитывание нового потом идёт молча: оно
 * короткое, и полоса мигала бы каждую минуту.
 */
export const ScanProgress = ({ scan }: ScanProgressProps) => {
  const { t } = useTranslation()

  if (!scan.running || scan.firstPassDone) return null

  return (
    <div className={styles.scan}>
      <ProgressBar
        label={t('statistics.scan.label')}
        value={scan.bytesTotal > 0 ? scan.bytesDone / scan.bytesTotal : undefined}
      />
      <p className={styles.note}>
        {t('statistics.scan.progress', {
          files: formatCount(scan.filesDone),
          filesTotal: formatCount(scan.filesTotal),
          bytes: formatBytes(scan.bytesDone),
          bytesTotal: formatBytes(scan.bytesTotal),
        })}
      </p>
    </div>
  )
}

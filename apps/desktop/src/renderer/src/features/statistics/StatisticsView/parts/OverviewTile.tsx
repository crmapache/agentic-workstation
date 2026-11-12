import { Card } from '@agentic-workstation/ui/Card'

import styles from '../StatisticsView.module.scss'
import type { OverviewTileProps } from '../StatisticsView.types'
import { DeltaMark } from './DeltaMark'

/**
 * Плитка сводки: подпись капсом, главное число с единицей, изменение против прошлого
 * периода, под ними - полоса долей и строки подробностей. Плотная карточка (Card sm): число
 * стоит сразу под подписью.
 */
export const OverviewTile = ({
  title,
  icon,
  value,
  unit,
  compare,
  period,
  children,
}: OverviewTileProps) => (
  <Card size="sm" title={title} icon={icon}>
    <div className={styles.tile}>
      <div className={styles.figureRow}>
        <span className={styles.figure}>{value}</span>
        {unit && <span className={styles.unit}>{unit}</span>}
        <span className={styles.deltaSlot}>
          <DeltaMark compare={compare} period={period} />
        </span>
      </div>
      {children}
    </div>
  </Card>
)

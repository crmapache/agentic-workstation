import clsx from 'clsx'

import { ChartLegend } from '../ChartTip/parts/ChartLegend'
import styles from './ShareBar.module.scss'
import type { ShareBarProps } from './ShareBar.types'

/**
 * Полоса долей: из чего сложено целое (ты и агенты, кеш и свежий вход) - куски тонов
 * рядов через зазор фона, крохотная доля не пропадает. С total - строка рейтинга: доля
 * от самого большого, остаток - пустая дорожка. Доля одного числа к пределу (заряд,
 * лимит) - не сюда, это ProgressBar и RingMeter.
 */
export const ShareBar = ({ label, segments, total, legend = false }: ShareBarProps) => {
  const filled = segments.filter((segment) => segment.value > 0)
  const sum = filled.reduce((all, segment) => all + segment.value, 0)
  const rest = total === undefined ? 0 : Math.max(0, total - sum)

  return (
    <div className={styles.shareBar}>
      <div role="img" aria-label={label} className={styles.track}>
        {filled.map((segment) => (
          <span
            key={segment.key}
            className={clsx(styles.segment, styles[segment.tone])}
            // eslint-disable-next-line no-restricted-syntax -- доля куска - само число из данных
            style={{ flexGrow: segment.value }}
          />
        ))}
        {(rest > 0 || sum === 0) && (
          <span
            className={styles.rest}
            // eslint-disable-next-line no-restricted-syntax -- остаток шкалы - разница чисел
            style={{ flexGrow: rest > 0 ? rest : 1 }}
          />
        )}
      </div>
      {legend && <ChartLegend items={segments} />}
    </div>
  )
}

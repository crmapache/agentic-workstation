import { useTranslation } from 'react-i18next'

import { useNow } from '../../../lib/now.hooks'
import styles from './TaskCapsules.module.scss'
import type { TaskCapsulesProps } from './TaskCapsules.types'
import { CapsuleChip } from './parts/CapsuleChip'

/**
 * Капсулы над лентой - как чипы потоков панели IDE и полоса ACC на телефоне: живые агенты,
 * фоновые команды и будильники агента. В ленте остаётся строка вызова, а следить и остановить -
 * здесь: нажатие открывает лист задачи. Полосы нет, пока ничего не идёт; лишнее листается вбок.
 */
export const TaskCapsules = ({ capsules, offset, openId, onOpen }: TaskCapsulesProps) => {
  const { t } = useTranslation()
  // Время на капсулах тикает, только пока они есть.
  const now = useNow(capsules.length > 0 ? 1000 : 60_000)

  if (capsules.length === 0) return null

  return (
    <div role="group" className={styles.capsules} aria-label={t('capsules.label')}>
      {capsules.map((capsule) => (
        <CapsuleChip
          key={capsule.id}
          capsule={capsule}
          now={now + offset}
          isOpen={capsule.id === openId}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

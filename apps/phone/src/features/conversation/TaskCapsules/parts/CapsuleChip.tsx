import clsx from 'clsx'
import { AlarmClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../TaskCapsules.module.scss'
import type { Capsule } from '../TaskCapsules.types'
import { capsuleMeta, capsuleName, capsuleTime, fleetPercent } from '../TaskCapsules.utils'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../Feed/Feed.constants'

/** Знак капсулы: агент крутится, флот - кольцом доли законченных, будильник - часами. */
const CapsuleMark = ({ capsule }: { capsule: Capsule }) => {
  const percent = fleetPercent(capsule)

  if (percent !== null) return <RingMeter value={percent} tone="neutral" label={`${percent}%`} />
  if (capsule.kind === 'wakeup') {
    return (
      <AlarmClock
        className={styles.mark}
        size={ROW_ICON_SIZE}
        strokeWidth={ROW_ICON_STROKE}
        aria-hidden
      />
    )
  }

  return <Spinner size="sm" tone={capsule.kind === 'command' ? 'neutral' : 'accent'} />
}

/**
 * Капсула задачи: знак, имя (тип агента, «bg», «wake»), время по часам IDE и чем занята -
 * узко, с многоточием. Фоновая команда и будильник - не агенты: пунктирная рамка, как в окне.
 * Нажатие открывает лист задачи, капсула горит, пока он открыт.
 */
export const CapsuleChip = ({
  capsule,
  now,
  isOpen,
  onOpen,
}: {
  capsule: Capsule
  /** Сейчас по часам IDE. */
  now: number
  isOpen: boolean
  onOpen: (id: string) => void
}) => {
  const { t } = useTranslation()
  const time = capsuleTime(t, capsule, now)
  const meta = capsuleMeta(capsule)
  const isAgent = capsule.kind === 'agent' || capsule.kind === 'workflow'

  return (
    <button
      type="button"
      className={clsx(styles.capsule, !isAgent && styles.static)}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={() => onOpen(capsule.id)}>
      <CapsuleMark capsule={capsule} />
      <span className={styles.name}>{capsuleName(t, capsule)}</span>
      {time && <span className={styles.time}>{time}</span>}
      {meta && <span className={styles.meta}>{meta}</span>}
    </button>
  )
}

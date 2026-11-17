import clsx from 'clsx'

import { AGENT_POINTER_RIM, AGENT_POINTER_PATH, AGENT_POINTER_SIZE } from './AgentPointer.constants'
import styles from './AgentPointer.module.scss'
import type { AgentPointerProps } from './AgentPointer.types'

/**
 * Стрелка ИИ (ADR 0040, 0079): наконечник тона коннектора со светлым тонким контуром и свечением,
 * на нажатие - круг от острия. Сам знак - точка привязки нулевого размера: родитель ставит её туда,
 * где мышь агента, и острие приходится ровно туда. Мышь не ловит, скринридеру не виден.
 */
export const AgentPointer = ({ tone, press = 0 }: AgentPointerProps) => (
  <span className={clsx(styles.pointer, styles[tone])} aria-hidden>
    {/* eslint-disable-next-line no-restricted-syntax -- силуэт стрелки ИИ, а не иконка: один с курсором расширения */}
    <svg
      className={styles.arrow}
      width={AGENT_POINTER_SIZE}
      height={AGENT_POINTER_SIZE}
      viewBox={`0 0 ${AGENT_POINTER_SIZE} ${AGENT_POINTER_SIZE}`}>
      <path d={AGENT_POINTER_PATH} strokeWidth={AGENT_POINTER_RIM} />
    </svg>
    {/* Новый номер - новый элемент: анимация круга начинается заново. */}
    {press > 0 && <span key={press} className={styles.ripple} />}
  </span>
)

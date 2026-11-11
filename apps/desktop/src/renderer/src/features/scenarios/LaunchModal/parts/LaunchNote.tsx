import clsx from 'clsx'
import { CircleAlert, TriangleAlert } from 'lucide-react'

import { NOTE_ICON_SIZE } from '../LaunchModal.constants'
import styles from '../LaunchModal.module.scss'
import type { LaunchNoteProps } from '../LaunchModal.types'

/**
 * Строка под выбором, по которой человек действует сейчас: предупреждение (та же папка у двух
 * очередей, незакоммиченное) или отказ (провайдера нет, сценарий с проблемами).
 */
export const LaunchNote = ({ tone = 'warning', children }: LaunchNoteProps) => {
  const Icon = tone === 'danger' ? CircleAlert : TriangleAlert

  return (
    <p className={clsx(styles.note, styles[tone])}>
      <Icon className={styles.noteIcon} size={NOTE_ICON_SIZE} aria-hidden />
      <span>{children}</span>
    </p>
  )
}

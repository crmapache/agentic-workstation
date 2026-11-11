import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'

import { CAUSE_ICONS } from '../LocalHistoryView.constants'
import { useWhenLabels } from '../LocalHistoryView.hooks'
import styles from '../LocalHistoryView.module.scss'
import type { RevisionRowProps } from '../LocalHistoryView.types'
import { causeOf, causeTone } from '../LocalHistoryView.utils'
import { clockLabel } from '../../../../lib/dates.utils'
import { splitPath } from '../../../../lib/path.utils'

/**
 * Строка версии: знак события (цветом - появился, удалён, правка ИИ), что случилось и время.
 * В истории папки первой строкой - файл, событие - под ним. Нажатие - разница справа.
 */
export const RevisionRow = ({ row, isFolder, isSelected, onSelect }: RevisionRowProps) => {
  const { t } = useTranslation()
  const { when } = useWhenLabels()
  const { name, path, from } = causeOf(row)
  const Icon = CAUSE_ICONS[name]
  const tone = causeTone(row)
  const cause = t(`localHistory.causes.${name}`, { path, name: from })
  const file = splitPath(row.path)

  return (
    <li>
      <button
        type="button"
        data-history-row={row.key}
        className={clsx(styles.row, isSelected && styles.selected)}
        aria-current={isSelected}
        aria-label={t('localHistory.rowLabel', {
          cause: isFolder ? `${row.path}: ${cause}` : cause,
          when: when(row.at),
        })}
        onClick={() => onSelect(row.key)}>
        <Icon className={clsx(styles.causeIcon, tone && styles[tone])} aria-hidden />
        {isFolder ? (
          <span className={styles.text}>
            <span className={styles.file}>
              <FileIcon path={row.path} kind="file" size="sm" />
              <span className={styles.fileName}>{file.name}</span>
              {file.folder && <span className={styles.fileFolder}>{file.folder}</span>}
            </span>
            <span className={styles.detail}>{cause}</span>
          </span>
        ) : (
          <span className={clsx(styles.text, styles.cause)}>{cause}</span>
        )}
        <time className={styles.time} dateTime={new Date(row.at).toISOString()}>
          {clockLabel(row.at)}
        </time>
      </button>
    </li>
  )
}

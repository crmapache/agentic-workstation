import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'

import styles from '../UserMessage.module.scss'
import type { EditorLineProps } from '../UserMessage.types'
import { PathLink } from '../../PathLink/PathLink'

/**
 * Что было открыто в редакторе, когда сообщение ушло: файл и сколько строк выделено.
 * Модель получила это рядом с сообщением, и вопрос «почему тут медленно?» читается
 * потом только с тем, о чём он. Нажатие открывает эти строки.
 */
export const EditorLine = ({ editor }: EditorLineProps) => {
  const { t } = useTranslation()
  const count = editor.from && editor.to ? editor.to - editor.from + 1 : 0
  const words =
    count > 0
      ? t('claudeCode.message.editorSelected', { count, name: editor.name })
      : t('claudeCode.message.editorOpened', { name: editor.name })
  const place = editor.from
    ? { line: editor.from, ...(editor.to && editor.to !== editor.from && { endLine: editor.to }) }
    : {}

  return (
    <div className={styles.editorLine}>
      <FileIcon path={editor.path} kind="file" size="sm" />
      <PathLink
        request={{ path: editor.path, ...place }}
        tone="inherit"
        className={styles.editorText}>
        {words}
      </PathLink>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { FILES_SHOWN } from '../RewindDialog.constants'
import styles from '../RewindDialog.module.scss'
import type { RewindCodeProps } from '../RewindDialog.types'
import { codeWords, pathParts } from '../RewindDialog.utils'

/**
 * Что тронет откат кода - под выбором, до нажатия: файлы поимённо (имя первым, папка
 * бледнее, полный путь в подсказке), строки и «and N more»; а если кода предложить
 * нечего - почему, словами, а не молча пропавший выбор.
 */
export const RewindCode = ({ code, showFiles }: RewindCodeProps) => {
  const { t } = useTranslation()

  if (!code) return <div className={styles.note}>{t('claudeCode.rewind.checking')}</div>
  if (code.state !== 'ready') return <div className={styles.note}>{codeWords(t, code)}</div>
  if (!showFiles) return null

  const shown = code.files.slice(0, FILES_SHOWN)
  const rest = code.count - shown.length

  return (
    <div className={styles.files}>
      <div className={styles.filesHeader}>
        <span>{t('claudeCode.rewind.files', { count: code.count })}</span>
        <span className={styles.added}>{`+${code.insertions}`}</span>
        <span className={styles.removed}>{`-${code.deletions}`}</span>
      </div>
      <ul className={styles.fileList}>
        {shown.map((file) => {
          const { name, folder } = pathParts(file)
          const row = (
            <span className={styles.file}>
              <span className={styles.fileName}>{name}</span>
              {folder && <span className={styles.folder}>{folder}</span>}
            </span>
          )

          return <li key={file}>{folder ? <Tooltip label={file}>{row}</Tooltip> : row}</li>
        })}
        {rest > 0 && (
          <li className={styles.more}>{t('claudeCode.rewind.more', { count: rest })}</li>
        )}
      </ul>
    </div>
  )
}

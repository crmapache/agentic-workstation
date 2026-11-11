import { useTranslation } from 'react-i18next'

import type { RewindPreviewWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { SHOWN_FILES } from '../RewindSheet.constants'
import styles from '../RewindSheet.module.scss'
import { failureText } from '../../../../state/commands.utils'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Что вернёт откат кода: файлы, которые правили инструменты агента после сообщения, - числом,
 * строками и первыми путями; или почему код не вернуть (копий нет, выключены, CLI не ответил).
 */
export const RewindPreview = ({
  preview,
  isPending,
  error,
}: {
  preview: RewindPreviewWire | undefined
  isPending: boolean
  error: unknown
}) => {
  const { t } = useTranslation()

  if (isPending) return <Spinner size="md" label={t('rewind.checking')} />
  if (error) return <p className={styles.note}>{failureText(t, error)}</p>
  if (!preview) return null
  if (preview.state === 'unavailable') {
    return <p className={styles.note}>{t('rewind.unavailable', { detail: preview.detail })}</p>
  }

  if (preview.state !== 'ready')
    return <p className={styles.note}>{t(`rewind.${preview.state}`)}</p>

  const hidden = preview.count - Math.min(preview.files.length, SHOWN_FILES)

  return (
    <div className={styles.files}>
      <p className={styles.summary}>
        {t('rewind.files', { count: preview.count })}
        <span className={styles.added}>{t('feed.added', { count: preview.insertions })}</span>
        <span className={styles.removed}>{t('feed.removed', { count: preview.deletions })}</span>
      </p>
      <ul className={styles.list}>
        {preview.files.slice(0, SHOWN_FILES).map((file) => (
          <li key={file} className={styles.file}>
            <PathText text={file} />
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className={styles.note}>{t('rewind.more', { count: hidden })}</p>}
    </div>
  )
}

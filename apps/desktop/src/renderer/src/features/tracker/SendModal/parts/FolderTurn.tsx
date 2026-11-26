import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SendModal.module.scss'
import type { FolderTurnProps } from '../SendModal.types'

/**
 * Папку проекта держат или ждут другие очереди (ADR 0128): новая очередь подождёт своей очереди к
 * ней - или, по выбору человека, начнёт сразу рядом, и тогда обе правят одни файлы.
 */
export const FolderTurn = ({ names, unfinished, alongside, onAlongside }: FolderTurnProps) => {
  const { t } = useTranslation()

  return (
    <>
      <Switch
        label={t('tracker.send.alongside')}
        description={t('tracker.send.alongsideNote')}
        checked={alongside}
        onChange={onAlongside}
      />
      <p className={styles.warning}>
        {alongside
          ? t('tracker.send.sharedFolder', { name: names })
          : unfinished
            ? t('tracker.send.waitsUnfinished', { name: unfinished })
            : t('tracker.send.waitsTurn', { name: names })}
      </p>
    </>
  )
}

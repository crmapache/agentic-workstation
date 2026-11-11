import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../CodeEditor.module.scss'
import type { DocumentNoticeProps } from '../CodeEditor.types'
import { documents } from '../../documents'
import { isOutsidePath } from '../../../../lib/path.utils'
import { diffTabKey } from '../../../../state/editor-tabs.utils'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Полоса над кодом, когда файл нельзя молча сохранить, - как уведомление редактора в
 * WebStorm. Конфликт: взять с диска или оставить своё. Удалён: записать снова или
 * закрыть. Не записался: ещё раз. Файл за проектом (ссылка туда или файл вне проекта):
 * сохранить по просьбе. До ответа
 * автосохранение ждёт.
 */
export const DocumentNotice = ({ projectId, path, notice }: DocumentNoticeProps) => {
  const { t } = useTranslation()
  const closeTabs = useSelectionStore((state) => state.closeTabs)
  // Файл вне проекта, открытый ссылкой, - не «через ссылку»: он сам за проектом.
  const message =
    notice.kind === 'saveFailed'
      ? t(`editor.notice.saveFailed.${notice.reason}`)
      : notice.kind === 'outside' && isOutsidePath(path)
        ? t('editor.notice.outsideFile')
        : t(`editor.notice.${notice.kind}`)

  const handleTakeDisk = () => void documents.find(projectId, path)?.takeDisk()

  const handleKeepMine = () => void documents.find(projectId, path)?.keepMine()

  const handleSave = () => void documents.find(projectId, path)?.saveAsked()

  // Закрыть - значит отпустить файл совсем: и его вкладку, и разницу с ним.
  const handleClose = () => {
    documents.discard(projectId, [path])
    closeTabs(projectId, [path, diffTabKey(path)])
  }

  return (
    <div className={styles.notice} role="alert">
      <TriangleAlert className={styles.noticeIcon} aria-hidden />
      <span className={styles.noticeText}>{message}</span>
      {notice.kind === 'conflict' && (
        <>
          <Button size="sm" variant="secondary" onClick={handleTakeDisk}>
            {t('editor.notice.takeDisk')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleKeepMine}>
            {t('editor.notice.keepMine')}
          </Button>
        </>
      )}
      {notice.kind === 'deleted' && (
        <>
          <Button size="sm" variant="secondary" onClick={handleKeepMine}>
            {t('editor.notice.saveAgain')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleClose}>
            {t('editor.notice.close')}
          </Button>
        </>
      )}
      {notice.kind === 'saveFailed' && (
        <Button size="sm" variant="secondary" onClick={handleSave}>
          {t('editor.notice.retry')}
        </Button>
      )}
      {notice.kind === 'outside' && (
        <Button size="sm" variant="secondary" onClick={handleSave}>
          {t('editor.notice.save')}
        </Button>
      )}
    </div>
  )
}

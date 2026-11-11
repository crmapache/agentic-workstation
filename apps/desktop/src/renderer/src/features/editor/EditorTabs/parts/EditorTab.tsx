import type { MouseEvent } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'
import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import styles from '../EditorTabs.module.scss'
import type { EditorTabProps } from '../EditorTabs.types'
import { requestCloseTabs } from '../../editor-close'
import { useDocumentNotice } from '../../editor.store'
import { useEditorStore } from '../../editor.store'
import { displayPath, isOutsidePath } from '../../../../lib/path.utils'
import { useAppInfo } from '../../../../state/app-info.queries'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Вкладка файла или разницы файла с последним коммитом: иконка типа или значок разницы, имя
 * (у одноимённых - с папкой), полный путь в подсказке (у файла вне проекта - через ~ и с
 * пометкой), крестик и средняя кнопка мыши закрывают, правая кнопка - меню. Файл с вопросом (конфликт с диском, не записался)
 * светится цветом внимания, пока вопрос не решён.
 */
export const EditorTab = ({
  projectId,
  tabKey,
  target,
  label,
  isActive,
  onMenu,
}: EditorTabProps) => {
  const { t } = useTranslation()
  const selectFile = useSelectionStore((state) => state.selectFile)
  const openDiff = useSelectionStore((state) => state.openDiff)
  const requestFocus = useEditorStore((state) => state.requestFocus)
  const { data: appInfo } = useAppInfo()
  const notice = useDocumentNotice(projectId, target.path)
  const isDiff = target.kind === 'diff'
  const hint = isDiff
    ? t('editor.tabs.diffHint', { path: target.path })
    : isOutsidePath(target.path)
      ? t('editor.tabs.outsideHint', { path: displayPath(target.path, appInfo?.homeDir) })
      : target.path

  // Выбрал вкладку мышью - пишешь в этот файл: клавиатура уходит в редактор, как в WebStorm.
  const handleActivate = () => {
    if (isDiff) openDiff(projectId, target.path)
    else selectFile(projectId, target.path)

    requestFocus()
  }

  const handleClose = () => requestCloseTabs(projectId, [tabKey])

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = event.currentTarget

    event.preventDefault()
    openWhenReleased(event.nativeEvent, () => onMenu(tabKey, anchor))
  }

  return (
    <ClosableTab
      width="fit"
      label={label}
      hint={hint}
      active={isActive}
      closeLabel={t('editor.tabs.close', { name: label })}
      leading={
        isDiff ? (
          <GitCompareArrows className={styles.diffIcon} aria-hidden />
        ) : (
          <FileIcon path={target.path} kind="file" size="sm" />
        )
      }
      call={notice ? 'attention' : null}
      calm
      onContextMenu={handleContextMenu}
      onActivate={handleActivate}
      onClose={handleClose}
    />
  )
}

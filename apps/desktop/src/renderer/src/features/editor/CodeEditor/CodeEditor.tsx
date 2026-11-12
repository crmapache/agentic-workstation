import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'

import { documentKey } from '../documents.utils'
import { useDocumentStatus } from '../editor.store'
import { useMarkdownLayout } from '../markdown-layout.store'
import { EditorContextMenu } from '../EditorContextMenu/EditorContextMenu'
import { useEditorContextMenu } from '../EditorContextMenu/EditorContextMenu.hooks'
import { MarkdownLayoutSwitch } from '../MarkdownLayoutSwitch/MarkdownLayoutSwitch'
import { MarkdownPreview } from '../MarkdownPreview/MarkdownPreview'
import { isMarkdownPath } from '../../../lib/syntax-languages.utils'
import { useCodeEditor, useSplitResize } from './CodeEditor.hooks'
import styles from './CodeEditor.module.scss'
import type { CodeEditorProps } from './CodeEditor.types'
import { DocumentNotice } from './parts/DocumentNotice'
import { DocumentPlaceholder } from './parts/DocumentPlaceholder'

/**
 * Код файла активной вкладки в Monaco, с подсветкой shiki и темой из токенов; у файла
 * Markdown - и просмотр рядом или вместо кода. Отдельный ленивый кусок: окно стартует без
 * Monaco, он грузится к первому открытому файлу (ADR 0005). Над кодом - вопрос, если файл
 * нельзя молча сохранить; вместо кода - почему его нет.
 */
export const CodeEditor = ({ projectId, path, place, isActive }: CodeEditorProps) => {
  const { t } = useTranslation()
  const status = useDocumentStatus(projectId, path)
  const layout = useMarkdownLayout(projectId, path)
  const { hostRef, probeRef, previewRef, editorRef } = useCodeEditor({
    projectId,
    path,
    place,
    isActive,
    status,
    layout,
  })
  const menu = useEditorContextMenu(editorRef)
  const { panesRef, splitRatio, handleResize } = useSplitResize()
  const isText = status.kind === 'text'
  const isSplit = layout === 'split'

  return (
    <div className={styles.codeEditor}>
      {isText && status.notice && (
        <DocumentNotice projectId={projectId} path={path} notice={status.notice} />
      )}
      <div ref={panesRef} className={styles.panes} hidden={!isText}>
        <div
          className={clsx(styles.codePane, isSplit && styles.besidePreview)}
          // eslint-disable-next-line no-restricted-syntax -- доля ширины меняется ручкой на лету
          style={isSplit ? { flexBasis: `${splitRatio * 100}%` } : undefined}
          hidden={layout === 'preview'}>
          <div ref={hostRef} className={styles.host} />
          <EditorContextMenu
            editorRef={editorRef}
            at={menu.at}
            readOnly={isText && status.readOnly}
            chatOwner={isText ? { projectId, path } : undefined}
            hasSelection={menu.hasSelection}
            onClose={menu.close}
          />
          {isSplit && (
            <ResizeHandle edge="end" label={t('editor.markdown.resize')} onResize={handleResize} />
          )}
        </div>
        {isText && isMarkdownPath(path) && (
          <MarkdownLayoutSwitch projectId={projectId} path={path} />
        )}
        {isText && layout !== 'editor' && (
          <MarkdownPreview
            key={documentKey(projectId, path)}
            ref={previewRef}
            projectId={projectId}
            path={path}
          />
        )}
      </div>
      {!isText && <DocumentPlaceholder status={status} />}
      <div ref={probeRef} className={styles.scrollbarProbe} aria-hidden />
    </div>
  )
}

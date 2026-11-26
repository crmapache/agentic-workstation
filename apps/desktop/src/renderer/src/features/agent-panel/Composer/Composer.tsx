import { useId, useRef, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { FIT_SPACER, useToolsFit } from '../composer-fit.hooks'
import { fitSteps } from '../composer-fit.utils'
import { carriesFiles } from '../field-clipboard.utils'
import { usePanelCapabilities } from '../panel.queries'
import { useSearchStore } from '../search.store'
import { EditorChip } from '../EditorChip/EditorChip'
import { useEditorFit } from '../EditorChip/EditorChip.hooks'
import { FieldChips } from '../FieldChips/FieldChips'
import { ROW_SQUARES } from './Composer.constants'
import { useComposer } from './Composer.hooks'
import styles from './Composer.module.scss'
import type { ComposerProps } from './Composer.types'
import { placeholderKey, suggestOptionId } from './Composer.utils'
import { ContextMeter } from './parts/ContextMeter'
import { GhostHint } from './parts/GhostHint'
import { SendButtons } from './parts/SendButtons'
import { SuggestList } from './parts/SuggestList'
import { WritingTools } from './parts/WritingTools'

/**
 * Поле ввода разговора, раскладка ACC: над рамкой - подсказка; в рамке - текст с чипами,
 * ряд кнопок: скрепка и «/», лупа, кольцо контекста, чип открытого файла, справа Stop,
 * Queue и Send. Узкая панель ряд не переносит, а ужимает. Контекст - кольцом в ряду, а не
 * полосой над текстом: ленте остаётся строка.
 */
export const Composer = (props: ComposerProps) => {
  const { conversation, draftKey } = props
  const { t } = useTranslation()
  const boxRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [isDropping, setIsDropping] = useState(false)
  const openSearch = useSearchStore((store) => store.openSearch)
  const canSearch = usePanelCapabilities().search
  const composer = useComposer(props)
  const { field, suggest, handlers } = composer
  const { fieldRef, registry, handleInput, handleCompositionEnd, handleMouseDown } = field
  const editorFit = useEditorFit(draftKey, composer.editor)
  const steps = useMemo(() => fitSteps(editorFit, ROW_SQUARES), [editorFit])
  const rowContent = `${conversation?.status ?? ''}|${composer.isShell}|${composer.isAside}`
  // На узкой панели ряд отдаёт шаги, а не переносится строкой ниже (как в ACC).
  const dropped = useToolsFit(rowRef, steps, rowContent)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event.dataTransfer)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDropping(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropping(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setIsDropping(false)
    composer.clipboard.handleDrop(event)
  }

  return (
    <div className={styles.composer} data-alone={!conversation || undefined}>
      {suggest.rows.length > 0 && (
        <SuggestList
          id={listId}
          rows={suggest.rows}
          highlight={suggest.highlight}
          isFiles={suggest.isFiles}
          onPick={suggest.pick}
          onHover={suggest.hover}
        />
      )}
      <div
        ref={boxRef}
        className={styles.box}
        {...composer.chatDrop.attributes}
        data-dropping={isDropping || composer.chatDrop.isOver || undefined}
        data-shell={composer.isShell || undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        {suggest.ghost && <GhostHint hint={suggest.ghost} fieldRef={fieldRef} boxRef={boxRef} />}
        <div
          ref={fieldRef}
          role="textbox"
          aria-multiline
          aria-label={t('agentPanel.composer.label')}
          aria-controls={suggest.rows.length > 0 ? listId : undefined}
          aria-activedescendant={
            suggest.rows.length > 0 ? suggestOptionId(listId, suggest.highlight) : undefined
          }
          className={styles.field}
          data-shell={composer.isShell || undefined}
          data-placeholder={
            composer.draft.tokens.length > 0 ? undefined : t(placeholderKey(conversation))
          }
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => handleInput(event.nativeEvent)}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handlers.handleKeyDown}
          onPaste={composer.clipboard.handlePaste}
          onCopy={composer.clipboard.handleCopy}
          onCut={composer.clipboard.handleCut}
          onDragStart={composer.clipboard.handleDragStart}
          onMouseDown={(event) => handleMouseDown(event.nativeEvent)}
          onFocus={handlers.handleFocus}
          onBlur={handlers.handleBlur}
        />
        <FieldChips registry={registry} fieldRef={fieldRef} />
        <div className={styles.toolbar}>
          <div ref={rowRef} className={styles.toolRow}>
            <WritingTools
              canSlash={composer.canSlash}
              onAttach={handlers.handleAttach}
              onSlash={handlers.handleSlash}
              onSearch={canSearch ? () => openSearch(conversation?.id ?? null) : null}
              dropped={dropped}
            />
            {conversation && <ContextMeter conversation={conversation} />}
            <EditorChip conversationKey={draftKey} editor={composer.editor} dropped={dropped} />
            <span {...FIT_SPACER} className={styles.spacer} />
            <SendButtons
              conversation={conversation}
              canSend={composer.canSend}
              isShell={composer.isShell}
              isAside={composer.isAside}
              keyQueues={composer.keyQueues}
              onSend={handlers.handleSend}
              onQueue={handlers.handleQueue}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

import { useRef, useState, useEffect, useLayoutEffect } from 'react'

import type { DraftToken } from '@shared/message-draft'

import { isAsideDraft } from '../aside.utils'
import { useComposerKeys } from '../composer-keys.hooks'
import { useComposerSend } from '../composer-send.hooks'
import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { hasContent, EMPTY_DRAFT } from '../draft.utils'
import { editorRefOf } from '../editor-context.utils'
import { registerField } from '../field-bus'
import { useFieldClipboard } from '../field-clipboard.hooks'
import { chipOfPath } from '../field-clipboard.utils'
import { takeKeyboard } from '../field-dom'
import { useFieldInsert } from '../field-insert.hooks'
import { useField } from '../field.hooks'
import { useConversationFeed, usePanelCapabilities } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { useCommandCatalog } from '../slash.hooks'
import { useSuggestions } from '../suggestions.hooks'
import { invoke } from '../../../lib/ipc'
import { useEditorSelection } from '../../../state/editor-selection.store'
import { useIdePrefs } from '../../../state/ide-prefs.queries'
import { useSelectedFile } from '../../../state/selection.store'
import { NO_SENT } from './Composer.constants'
import styles from './Composer.module.scss'
import type { ComposerProps } from './Composer.types'
import { imageBaseOf, isCompacting, isShellDraft } from './Composer.utils'

/**
 * Поле ввода разговора (как в ACC): черновик с чипами, подсказки «/» и «@», вложения,
 * клавиши и отправка. Первое сообщение в проекте без разговоров
 * заводит разговор. Черновик и история - в composer.store, разговор - у главного процесса.
 */
export const useComposer = ({ project, conversation, draftKey }: ComposerProps) => {
  const idePrefs = useIdePrefs()
  const canAskAside = usePanelCapabilities().sideQuestion
  const actions = useConversationActions()
  const draft = useComposerStore((store) => store.drafts[draftKey] ?? EMPTY_DRAFT)
  const sent = useComposerStore((store) => store.sent[draftKey] ?? NO_SENT)
  const queueEdit = useComposerStore((store) => store.queueEdits[draftKey])
  const focusRequest = usePanelStore((store) => store.focusRequest)
  const [isFocused, setIsFocused] = useState(false)
  const { data: feed } = useConversationFeed(conversation?.id)
  const items = feed?.items ?? []
  const imageBase = imageBaseOf(items, conversation?.queue ?? [])
  const selected = useSelectedFile(project.id)
  const selection = useEditorSelection(project.id, selected)
  const editor = selected ? editorRefOf(selected, selection) : null
  const catalog = useCommandCatalog(project, conversation, isFocused)
  const isRunning = conversation !== null && conversation.status !== 'idle'
  const isShell = isShellDraft(draft.tokens)

  const handleChange = (tokens: DraftToken[]) => {
    const store = useComposerStore.getState()
    const next = { tokens, quotes: store.drafts[draftKey]?.quotes ?? [] }

    store.setDraft(draftKey, next)

    // Опустевшее поле - с вынутым из очереди сообщением так или иначе расстались.
    if (!hasContent(next)) store.setQueueEdit(draftKey, null)
  }

  const field = useField({
    tokens: draft.tokens,
    onChange: handleChange,
    imageBase,
    commands: catalog.commands,
    chipClassName: styles.chip ?? '',
  })
  const insert = useFieldInsert(field)
  const clipboard = useFieldClipboard({
    field,
    insert,
    projectId: project.id,
    pasteCollapse: idePrefs.pasteCollapse,
    imageBase,
    commands: catalog.commands,
  })
  const suggest = useSuggestions({
    project,
    field,
    insert,
    tokens: draft.tokens,
    commands: catalog.commands,
    argumentSets: catalog.argumentSets,
    isActive: isFocused && !isShell,
  })
  const { submit } = useComposerSend({
    project,
    conversation,
    draftKey,
    draft,
    imageBase,
    editor,
    ...catalog,
  })
  const keys = useComposerKeys({
    field,
    tokens: draft.tokens,
    sent,
    suggestKey: suggest.handleKey,
    // Посреди /compact всё ждёт очереди: сжатие глотает то, что пишут в процесс.
    letGo: (mode) => void submit(isCompacting(items, conversation) ? 'queue' : mode),
    keyQueues: queueEdit !== undefined,
    isRunning,
  })
  const port = useRef({ applyTokens: field.applyTokens, insertChip: insert.insertChip })

  useLayoutEffect(() => {
    port.current = { applyTokens: field.applyTokens, insertChip: insert.insertChip }
  })

  // Куски извне - шагом отмены поля: черновик (вернуть сообщение, вынутое из очереди)
  // целиком, чип (цитата из ленты, кусок из редактора) - на место каретки.
  useEffect(
    () =>
      registerField(draftKey, {
        apply: (next) => {
          const store = useComposerStore.getState()

          store.setDraft(draftKey, {
            tokens: store.drafts[draftKey]?.tokens ?? [],
            quotes: next.quotes,
          })
          port.current.applyTokens(next.tokens)
        },
        insertChip: (chip) => port.current.insertChip(chip),
      }),
    [draftKey],
  )

  // Новая вкладка или просьба о фокусе - клавиатура полю, каретка где была или в конце.
  useEffect(() => {
    if (field.fieldRef.current) takeKeyboard(field.fieldRef.current)
  }, [conversation?.id, focusRequest, field.fieldRef])

  const handleAttach = async () => {
    const picked = await invoke('claude:pickAttachments', { projectId: project.id }).catch(() => [])

    for (const item of picked) insert.insertChip(chipOfPath(item))

    field.fieldRef.current?.focus()
  }

  return {
    field,
    draft,
    suggest,
    clipboard,
    editor,
    isShell,
    // В поле вопрос сбоку (/btw): Send - «Ask aside», Queue нет (как в ACC). Без вопроса сбоку
    // у провайдера «/btw» - обычный текст.
    isAside: canAskAside && isAsideDraft(draft.tokens),
    isRunning,
    keyQueues: queueEdit !== undefined,
    canSend: hasContent(draft),
    // Команда пишется только в начале: посреди текста «/» - просто знак.
    canSlash: !isShell && (draft.tokens.length === 0 || suggest.head === ''),
    handlers: {
      handleKeyDown: keys.handleKeyDown,
      handleSend: () => keys.letGo('send'),
      handleQueue: () => keys.letGo('queue'),
      handleAttach: () => void handleAttach(),
      handleSlash: () => {
        insert.insertText('/')
        field.fieldRef.current?.focus()
      },
      handleStop: () => conversation && void actions.interrupt(conversation.id),
      handleFocus: () => setIsFocused(true),
      handleBlur: () => {
        setIsFocused(false)
        field.clearChipSelection()
      },
    },
  }
}

import type { EffortLevel, Conversation } from '@shared/conversation'
import type { EditorRef } from '@shared/message-draft'
import type { CommandEntry } from '@shared/slash-catalog'
import type { Project } from '@shared/workspace'

import { useComposerStore } from './composer.store'
import { useConversationActions } from './conversation-actions.hooks'
import type { ComposerDraft, OutgoingMessage } from './draft.types'
import {
  hasContent,
  tokensText,
  EMPTY_DRAFT,
  composePrompt,
  messageDraftOf,
  imageAttachments,
  trimTrailingSpace,
} from './draft.utils'
import { editorGoes } from './editor-context.utils'
import { usePanelPrefs, useEffortLevels } from './panel.queries'
import { localCommand, captureWrittenCommand } from './slash-capture.utils'
import { DEFAULT_ARGUMENT } from './slash.constants'
import type { PanelAction, LocalCommand, CommandOption } from './slash.types'

type SendOptions = {
  project: Project
  conversation: Conversation | null
  draftKey: string
  draft: ComposerDraft
  /** Сколько картинок уже ушло в разговоре: номера [Image #N] продолжают счёт. */
  imageBase: number
  commands: readonly CommandEntry[]
  argumentSets: Readonly<Record<string, readonly CommandOption[]>>
  panelActions: Partial<Record<string, PanelAction>>
  /** Открытый в редакторе файл, если он есть. */
  editor: EditorRef | null
}

/**
 * Отпустить сообщение - одна дверь для клавиши, Send и Queue (как в ACC `letGo`): оно же
 * попадает в историю ↑. «!» - команда терминала, команды панели и /model, /effort со
 * знакомым значением выполняет IDE, остальное уходит CLI текстом с вложениями,
 * цитатами и открытым файлом. Не ушло - черновик возвращается в поле.
 */
export const useComposerSend = (options: SendOptions) => {
  const { project, conversation, draftKey, draft } = options
  const actions = useConversationActions()
  const { shareEditor } = usePanelPrefs()
  const efforts = useEffortLevels(conversation?.model ?? null)
  const store = useComposerStore

  /** Разговор, куда уйдёт написанное: в проекте без разговоров он заводится. */
  const target = async () =>
    conversation?.id ??
    (await actions.newConversation(project.id))?.activeByProject[project.rootPath] ??
    null

  /** Не ушло - обратно в поле, если человек не начал там новое. */
  const restore = (key: string, back: ComposerDraft) => {
    if (!hasContent(store.getState().drafts[key] ?? EMPTY_DRAFT))
      store.getState().setDraft(key, back)
  }

  const runLocal = ({ name, argument }: LocalCommand) => {
    const value = argument === DEFAULT_ARGUMENT ? null : argument

    if (name === 'model' && conversation) void actions.setOptions(conversation.id, { model: value })
    else if (name === 'effort' && conversation) {
      const effort = efforts.find((level) => level === value) ?? null

      void actions.setOptions(conversation.id, { effort: effort satisfies EffortLevel | null })
    } else {
      options.panelActions[name]?.(argument)
    }
  }

  const runShell = async (command: string) => {
    const id = await target()
    const started = id ? await actions.runShell(id, command) : null

    if (!started) restore(id ?? draftKey, draft)
  }

  /** Сообщение для главного процесса: текст, вложения, куски и открытый файл. */
  const outgoing = (tokens: ComposerDraft['tokens']): OutgoingMessage => {
    const sending = { tokens, quotes: draft.quotes }
    const text = composePrompt(sending, options.imageBase)
    const once = store.getState().editorOnce[draftKey]
    const editor =
      options.editor &&
      !text.trimStart().startsWith('/') &&
      editorGoes(shareEditor, once, options.editor)
        ? options.editor
        : null

    return { text, images: imageAttachments(tokens), draft: messageDraftOf(sending), editor }
  }

  const submit = async (mode: 'send' | 'queue') => {
    const typed = trimTrailingSpace(draft.tokens)
    const plain = tokensText(typed).trim()
    const state = store.getState()

    if (!hasContent({ tokens: typed, quotes: draft.quotes })) return

    state.rememberSent(draftKey, draft.tokens)
    state.setDraft(draftKey, EMPTY_DRAFT)

    if (plain.startsWith('!')) return runShell(plain.slice(1).trim())

    const local = localCommand(
      plain,
      new Set(Object.keys(options.panelActions)),
      options.argumentSets,
    )

    if (local) return runLocal(local)

    const message = outgoing(captureWrittenCommand(typed, options.commands) ?? typed)
    const place = state.queueEdits[draftKey]?.before ?? null

    state.setEditorOnce(draftKey, null)
    state.setQueueEdit(draftKey, null)

    const id = await target()
    const sent = !id
      ? null
      : mode === 'queue'
        ? await actions.enqueue(id, message, place)
        : await actions.send(id, message)

    // Главный процесс не принял - текст, чипы и цитаты возвращаются в поле.
    if (!sent) restore(id ?? draftKey, draft)
  }

  return { submit }
}

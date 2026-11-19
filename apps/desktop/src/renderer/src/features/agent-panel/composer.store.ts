import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { DraftToken } from '@shared/message-draft'

import type { AskDraft } from './ask-draft.types'
import { SENT_HISTORY_KEPT, COMPOSER_STORAGE_KEY } from './composer.constants'
import { draftStorage, savableDrafts } from './composer.utils'
import type { ComposerDraft } from './draft.types'
import type { EditorOnce } from './editor-context.types'

type ComposerStore = {
  /**
   * Черновик поля по разговору (ключ проекта без разговоров - путь проекта). Переживает
   * смену вкладки и перезапуск окна; байты картинок на диск не едут - у вставленной
   * картинки есть её файл.
   */
  drafts: Record<string, ComposerDraft>
  setDraft: (key: string, draft: ComposerDraft) => void
  /** Отправленные из этой вкладки сообщения кусками - для ↑ и ↓ в пустом поле. */
  sent: Record<string, DraftToken[][]>
  rememberSent: (key: string, tokens: DraftToken[]) => void
  /** Сообщение очереди вынуто в поле: Enter и Queue вернут его перед этим соседом. */
  queueEdits: Record<string, { before: string | null }>
  setQueueEdit: (key: string, edit: { before: string | null } | null) => void
  /** Открытый файл наперекор настройке - на одно сообщение вкладки. */
  editorOnce: Record<string, EditorOnce>
  setEditorOnce: (key: string, once: EditorOnce | null) => void
  /** Собранные ответы на вопрос с вариантами - по id вопроса CLI, вне карточки. */
  askDrafts: Record<string, AskDraft>
  setAskDraft: (requestId: string, draft: AskDraft | null) => void
}

/** Ни одного куска и ни одной цитаты. */
const isBlank = (draft: ComposerDraft) => draft.tokens.length === 0 && draft.quotes.length === 0

const without = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _gone, ...rest } = record

  return rest
}

const put = <T>(record: Record<string, T>, key: string, value: T | null): Record<string, T> =>
  value === null ? without(record, key) : { ...record, [key]: value }

/**
 * Интерфейсное состояние поля ввода Claude Code: черновики (на диск), история
 * отправленного, правка очереди, исключение редактора и ответы на вопросы. Разговоры и
 * очередь - у главного процесса.
 */
export const useComposerStore = create<ComposerStore>()(
  persist(
    (set) => ({
      drafts: {},
      // Пустой черновик - без записи; пробелы - не пустой: стереть их значило бы отнять
      // у поля только что набранное.
      setDraft: (key, draft) =>
        set((state) => ({
          drafts: put(state.drafts, key, isBlank(draft) ? null : draft),
        })),
      sent: {},
      rememberSent: (key, tokens) =>
        set((state) => ({
          sent: {
            ...state.sent,
            [key]: [...(state.sent[key] ?? []), tokens].slice(-SENT_HISTORY_KEPT),
          },
        })),
      queueEdits: {},
      setQueueEdit: (key, edit) =>
        set((state) => ({ queueEdits: put(state.queueEdits, key, edit) })),
      editorOnce: {},
      setEditorOnce: (key, once) =>
        set((state) => ({ editorOnce: put(state.editorOnce, key, once) })),
      askDrafts: {},
      setAskDraft: (requestId, draft) =>
        set((state) => ({ askDrafts: put(state.askDrafts, requestId, draft) })),
    }),
    {
      name: COMPOSER_STORAGE_KEY,
      storage: createJSONStorage(() => draftStorage),
      partialize: ({ drafts }) => ({ drafts: savableDrafts(drafts) }),
    },
  ),
)

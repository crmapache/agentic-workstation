import { create } from 'zustand'

import type { ExtensionDialogRequest } from '@shared/extension-ui'

type ExtensionDialogsStore = {
  /** Вопросы расширений человеку по порядку: на виду - первый. */
  queue: ExtensionDialogRequest[]
  push: (request: ExtensionDialogRequest) => void
  remove: (requestId: string) => void
}

/**
 * Вопросы расширений человеку (ADR 0091): prompt, confirm, pick. Их держит главный процесс и
 * ждёт ответа; окно показывает по одному и отвечает каналом extensions:answerDialog.
 */
export const useExtensionDialogs = create<ExtensionDialogsStore>()((set) => ({
  queue: [],
  push: (request) =>
    set((state) =>
      state.queue.some((item) => item.requestId === request.requestId)
        ? state
        : { queue: [...state.queue, request] },
    ),
  remove: (requestId) =>
    set((state) => ({ queue: state.queue.filter((item) => item.requestId !== requestId) })),
}))

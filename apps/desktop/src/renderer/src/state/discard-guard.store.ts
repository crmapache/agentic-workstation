import { create } from 'zustand'

import { baseName } from '../lib/path.utils'
import { useSelectionStore } from './selection.store'

/** Что закрывают, теряя несохранённое: от этого - слова вопроса и кнопка согласия. */
export type DiscardKind = 'tabs' | 'project' | 'window' | 'quit' | 'update'

/**
 * Вопрос «потерять несохранённое?»: сколько файлов и имя первого (для вопроса об одном),
 * что сделать, если человек согласен, и если нет.
 */
export type DiscardRequest = {
  kind: DiscardKind
  count: number
  name: string
  onConfirm: () => void
  onCancel?: (() => void) | undefined
}

type DiscardGuardStore = {
  request: DiscardRequest | null
  /** Закрыть окно или перезагрузить его можно и с несохранённым: человек согласился. */
  unloadAllowed: boolean
  ask: (request: DiscardRequest) => void
  settle: (confirmed: boolean) => void
  allowUnload: () => void
}

/**
 * Один вопрос перед потерей правок, которые не дошли до диска (конфликт с диском, файл
 * удалён, нет прав, файл за проектом), - для закрытия вкладки, проекта, окна, выхода и
 * обновления. Задают его разные части окна, показывает одно место - раскладка окна.
 */
export const useDiscardGuard = create<DiscardGuardStore>()((set, get) => ({
  request: null,
  unloadAllowed: false,
  ask: (request) => set({ request }),
  settle: (confirmed) => {
    const { request } = get()

    set({ request: null })

    if (confirmed) request?.onConfirm()
    else request?.onCancel?.()
  },
  allowUnload: () => set({ unloadAllowed: true }),
}))

/** Файлы с несохранённым вопросом: в проекте или во всех открытых. */
export const heldPaths = (projectId?: string): readonly string[] => {
  const { heldByProject } = useSelectionStore.getState()

  return projectId === undefined
    ? Object.values(heldByProject).flat()
    : (heldByProject[projectId] ?? [])
}

/**
 * Сделать то, что теряет несохранённое в этих файлах, - сразу, если терять нечего, или
 * после согласия человека.
 */
export const guardDiscard = (
  kind: DiscardKind,
  held: readonly string[],
  onConfirm: () => void,
  onCancel?: () => void,
) => {
  if (held.length === 0) return onConfirm()

  const name = held[0] === undefined ? '' : baseName(held[0])

  useDiscardGuard.getState().ask({ kind, count: held.length, name, onConfirm, onCancel })
}

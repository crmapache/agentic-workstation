import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { isInsideAny, movedPathOf } from '../../lib/path.utils'
import { ancestorPaths, movedExpanded, withoutExpanded } from './file-tree.utils'

const FILE_TREE_STORAGE_KEY = 'agentic-workstation.file-tree.v1'

/** Последняя просьба показать файл в дереве. Номер растёт на каждую - даже на тот же файл. */
type RevealRequest = {
  projectId: string
  relativePath: string
  serial: number
}

type FileTreeStore = {
  /** Раскрытые папки каждого проекта: пути от корня. */
  expandedByProject: Record<string, string[]>
  revealed: RevealRequest | null
  toggleDirectory: (projectId: string, relativePath: string) => void
  /**
   * Показать файл или папку в дереве: раскрыть все папки над ним и попросить строку
   * прокрутиться к себе. Выбрали не в дереве (поиском, ссылкой в ленте), а видно
   * должно быть. expand - раскрыть и саму папку: показать папку - показать, что в ней.
   */
  revealPath: (projectId: string, relativePath: string, options?: RevealOptions) => void
  /** Свернуть все папки проекта (Collapse All). */
  collapseAll: (projectId: string) => void
  clipboard: TreeClipboard | null
  setClipboard: (clipboard: TreeClipboard | null) => void
  /** Перенесли или переименовали: раскрытое и буфер смотрят на новое место. */
  moved: (projectId: string, from: string, to: string) => void
  /** Убрали в корзину: забыть раскрытое внутри и буфер с ним. */
  removed: (projectId: string, path: string) => void
}

type RevealOptions = { expand?: boolean }

/**
 * Скопированный или вырезанный в дереве файл или папка: вставка копирует или переносит его в
 * выбранную папку того же проекта. Вырезанный после вставки забывается, скопированный - нет.
 */
export type TreeClipboard = { projectId: string; path: string; mode: 'copy' | 'cut' }

/** Какие папки раскрыты в дереве. Нужно только дереву, поэтому живёт в его фиче. */
export const useFileTreeStore = create<FileTreeStore>()(
  persist(
    (set) => ({
      expandedByProject: {},
      revealed: null,
      toggleDirectory: (projectId, relativePath) =>
        set((state) => {
          const expanded = state.expandedByProject[projectId] ?? []
          const next = expanded.includes(relativePath)
            ? expanded.filter((path) => path !== relativePath)
            : [...expanded, relativePath]

          return { expandedByProject: { ...state.expandedByProject, [projectId]: next } }
        }),
      revealPath: (projectId, relativePath, options) =>
        set((state) => {
          const expanded = state.expandedByProject[projectId] ?? []
          const wanted = ancestorPaths(relativePath)

          // Корень проекта ('') - не строка дерева, раскрывать нечего.
          if (options?.expand && relativePath) wanted.push(relativePath)

          const missing = wanted.filter((path) => !expanded.includes(path))

          return {
            expandedByProject: {
              ...state.expandedByProject,
              [projectId]: [...expanded, ...missing],
            },
            revealed: { projectId, relativePath, serial: (state.revealed?.serial ?? 0) + 1 },
          }
        }),
      collapseAll: (projectId) =>
        set((state) => ({ expandedByProject: { ...state.expandedByProject, [projectId]: [] } })),
      clipboard: null,
      setClipboard: (clipboard) => set({ clipboard }),
      moved: (projectId, from, to) =>
        set((state) => ({
          expandedByProject: {
            ...state.expandedByProject,
            [projectId]: movedExpanded(state.expandedByProject[projectId] ?? [], from, to),
          },
          clipboard:
            state.clipboard?.projectId === projectId
              ? { ...state.clipboard, path: movedPathOf(state.clipboard.path, from, to) }
              : state.clipboard,
        })),
      removed: (projectId, path) =>
        set((state) => ({
          expandedByProject: {
            ...state.expandedByProject,
            [projectId]: withoutExpanded(state.expandedByProject[projectId] ?? [], path),
          },
          clipboard:
            state.clipboard?.projectId === projectId && isInsideAny(state.clipboard.path, [path])
              ? null
              : state.clipboard,
        })),
    }),
    // Просьба показать файл и буфер - события этого запуска, переживать перезапуск им незачем.
    {
      name: FILE_TREE_STORAGE_KEY,
      partialize: ({ expandedByProject }) => ({ expandedByProject }),
    },
  ),
)

export const useIsExpanded = (projectId: string, relativePath: string) =>
  useFileTreeStore((state) => state.expandedByProject[projectId]?.includes(relativePath) ?? false)

/** Номер последней просьбы показать именно эту строку; 0 - такой просьбы не было. */
export const useRevealSerial = (projectId: string, relativePath: string) =>
  useFileTreeStore((state) =>
    state.revealed?.projectId === projectId && state.revealed.relativePath === relativePath
      ? state.revealed.serial
      : 0,
  )

/** Вырезан ли путь в буфер: строка тогда бледнее, как в Finder и WebStorm. */
export const useIsCut = (projectId: string, relativePath: string) =>
  useFileTreeStore(
    (state) =>
      state.clipboard?.mode === 'cut' &&
      state.clipboard.projectId === projectId &&
      state.clipboard.path === relativePath,
  )

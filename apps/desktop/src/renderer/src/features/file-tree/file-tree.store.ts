import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { ancestorPaths } from './file-tree.utils'

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
}

type RevealOptions = { expand?: boolean }

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
    }),
    // Просьба показать файл - событие этого запуска, переживать перезапуск ей незачем.
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

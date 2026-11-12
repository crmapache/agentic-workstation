import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { EDITOR_TABS_LIMIT } from './editor-tabs.constants'
import type { TabTarget, EditorTabs } from './editor-tabs.types'
import {
  NO_TABS,
  openTab,
  activeTab,
  closeTabs,
  movedTabs,
  tabTarget,
  restoreTabs,
  openSingleTab,
} from './editor-tabs.utils'

const SELECTION_STORAGE_KEY = 'agentic-workstation.selection.v1'

/**
 * Третья версия - ключи вкладок (файл или разница файла); вторая звала их путями (paths),
 * первая помнила один выбранный файл проекта.
 */
const SELECTION_STORAGE_VERSION = 3

const NO_KEYS: readonly string[] = []

/**
 * Где в файле встать, когда его открыли не из дерева: всё с 1, как считает человек.
 * Диапазон (endLine, endColumn) редактор выделяет, конец включительно. find - текст
 * строки, когда номера нет (первая добавленная строка правки): CLI не сообщает, где
 * в файле правка, и место ищет редактор по тексту.
 */
export type FilePlace = {
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  find?: string
}

type SelectionStore = {
  /** Вкладки середины каждого проекта: переключил проект - вернулся к своим. */
  tabsByProject: Record<string, EditorTabs>
  /** Где встать в выбранном файле; нет - открыть как есть. */
  selectedPlaceByProject: Record<string, FilePlace | undefined>
  /**
   * Вкладки, которые нельзя закрыть молча: в них несохранённое (конфликт с диском,
   * отказ записи). Пишет редактор, переполнение полосы их пропускает.
   */
  heldByProject: Record<string, readonly string[]>
  /**
   * Растёт на каждый выбор файла или его разницы, и повторный того же: по нему середина
   * показывает вид «файл».
   */
  selectSerial: number
  /** Открыть файл вкладкой: путь от корня или абсолютный путь файла вне проекта. */
  selectFile: (projectId: string, path: string, place?: FilePlace) => void
  /** Разница файла с последним коммитом - во вкладке разницы проекта (она одна). */
  openDiff: (projectId: string, relativePath: string) => void
  /** Локальная история файла или папки ('' - проект) - во вкладке истории (она одна). */
  openHistory: (projectId: string, relativePath: string) => void
  /** Закрыть вкладки по ключам: путь файла или ключ разницы (diffTabKey). */
  closeTabs: (projectId: string, keys: readonly string[]) => void
  /** Файл или папку перенесли в дереве: их вкладки смотрят на новое место. */
  moveTabs: (projectId: string, from: string, to: string) => void
  setHeld: (projectId: string, relativePaths: readonly string[]) => void
  /**
   * Файл, который вкладка истории показывает справа: у истории папки это файл выбранной
   * версии. Он - открытый файл для Claude Code, пока активна история. Пишет вид истории.
   */
  historyFileByProject: Record<string, string | undefined>
  showHistoryFile: (projectId: string, path: string | undefined) => void
  /** Проекты закрыли - их вкладки больше не нужны: id у открытого заново будет новым. */
  keepProjects: (projectIds: readonly string[]) => void
}

const pick = <T>(record: Record<string, T>, keys: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)))

/** Открыть разницу или историю - единственную такую вкладку проекта; место выбора сброшено. */
const openSingle = (
  state: Pick<
    SelectionStore,
    'tabsByProject' | 'heldByProject' | 'selectedPlaceByProject' | 'selectSerial'
  >,
  projectId: string,
  target: TabTarget,
) => ({
  tabsByProject: {
    ...state.tabsByProject,
    [projectId]: openSingleTab(state.tabsByProject[projectId] ?? NO_TABS, target, {
      limit: EDITOR_TABS_LIMIT,
      held: new Set(state.heldByProject[projectId]),
    }),
  },
  selectedPlaceByProject: { ...state.selectedPlaceByProject, [projectId]: undefined },
  selectSerial: state.selectSerial + 1,
})

/**
 * Какие файлы открыты вкладками и какой из них в редакторе. Общее для дерева файлов
 * (подсветка), редактора (вкладки, что показать и где встать), строки состояния (путь)
 * и панели Claude Code (открытый файл уходит с сообщением), поэтому живёт здесь, а не в
 * одной фиче.
 */
export const useSelectionStore = create<SelectionStore>()(
  persist(
    (set) => ({
      tabsByProject: {},
      selectedPlaceByProject: {},
      heldByProject: {},
      selectSerial: 0,
      // Выбор без места (клик в дереве, во вкладке) сбрасывает место прошлого выбора.
      selectFile: (projectId, path, place) =>
        set((state) => ({
          tabsByProject: {
            ...state.tabsByProject,
            [projectId]: openTab(state.tabsByProject[projectId] ?? NO_TABS, path, {
              limit: EDITOR_TABS_LIMIT,
              held: new Set(state.heldByProject[projectId]),
            }),
          },
          selectedPlaceByProject: { ...state.selectedPlaceByProject, [projectId]: place },
          selectSerial: state.selectSerial + 1,
        })),
      openDiff: (projectId, relativePath) =>
        set((state) => openSingle(state, projectId, { kind: 'diff', path: relativePath })),
      openHistory: (projectId, relativePath) =>
        set((state) => openSingle(state, projectId, { kind: 'history', path: relativePath })),
      // Место прошлого выбора к открывшейся вместо закрытой вкладке не относится.
      closeTabs: (projectId, keys) =>
        set((state) => ({
          tabsByProject: {
            ...state.tabsByProject,
            [projectId]: closeTabs(state.tabsByProject[projectId] ?? NO_TABS, keys),
          },
          selectedPlaceByProject: { ...state.selectedPlaceByProject, [projectId]: undefined },
        })),
      moveTabs: (projectId, from, to) =>
        set((state) => ({
          tabsByProject: {
            ...state.tabsByProject,
            [projectId]: movedTabs(state.tabsByProject[projectId] ?? NO_TABS, from, to),
          },
        })),
      setHeld: (projectId, relativePaths) =>
        set((state) => ({ heldByProject: { ...state.heldByProject, [projectId]: relativePaths } })),
      historyFileByProject: {},
      showHistoryFile: (projectId, path) =>
        set((state) => ({
          historyFileByProject: { ...state.historyFileByProject, [projectId]: path },
        })),
      keepProjects: (projectIds) =>
        set((state) => {
          const open = new Set(projectIds)

          return {
            tabsByProject: pick(state.tabsByProject, open),
            selectedPlaceByProject: pick(state.selectedPlaceByProject, open),
            heldByProject: pick(state.heldByProject, open),
            historyFileByProject: pick(state.historyFileByProject, open),
          }
        }),
    }),
    // Место - просьба этого запуска: после перезапуска файл открывается как есть.
    {
      name: SELECTION_STORAGE_KEY,
      version: SELECTION_STORAGE_VERSION,
      partialize: ({ tabsByProject }) => ({ tabsByProject }),
      // Первая версия помнила один выбранный файл - он становится единственной вкладкой.
      // Вторая звала ключи вкладок путями: тогда все вкладки и были файлами.
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Record<string, Record<string, unknown> | undefined>

        if (version >= SELECTION_STORAGE_VERSION) return saved

        if (version === 2) {
          return {
            tabsByProject: Object.fromEntries(
              Object.entries(saved['tabsByProject'] ?? {}).map(([projectId, tabs]) => {
                const { paths, recent } = (tabs ?? {}) as Record<string, unknown>

                return [projectId, { keys: paths, recent }]
              }),
            ),
          }
        }

        return {
          tabsByProject: Object.fromEntries(
            Object.entries(saved['selectedFileByProject'] ?? {})
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .map(([projectId, path]) => [projectId, { keys: [path], recent: [path] }]),
          ),
        }
      },
      merge: (persisted, current) => {
        const saved = (persisted as { tabsByProject?: unknown } | undefined)?.tabsByProject
        const entries = typeof saved === 'object' && saved !== null ? Object.entries(saved) : []

        return {
          ...current,
          tabsByProject: Object.fromEntries(
            entries.map(([projectId, tabs]) => [projectId, restoreTabs(tabs)]),
          ),
        }
      },
    },
  ),
)

/** Ключ активной вкладки проекта (файл или разница). undefined - вкладок нет. */
export const useActiveTab = (projectId: string | undefined) =>
  useSelectionStore((state) => (projectId ? activeTab(state.tabsByProject[projectId]) : undefined))

/**
 * Путь активной вкладки проекта: файл, разница с ним или чья история (у папки - сама папка).
 * Его видят дерево (подсветка и «найти открытый») и строка состояния. undefined - вкладок нет
 * или активна история всего проекта: пути у неё нет.
 */
export const useSelectedPath = (projectId: string | undefined) => {
  const key = useActiveTab(projectId)
  const path = key === undefined ? '' : tabTarget(key).path

  return path === '' ? undefined : path
}

/**
 * Файл, открытый в середине: код, разница с ним или файл, который показывает история (у
 * истории папки - файл выбранной версии). Его с сообщением видит Claude Code. undefined -
 * вкладок нет или файла не показано.
 */
export const useSelectedFile = (projectId: string | undefined) =>
  useSelectionStore((state) => {
    const key = projectId ? activeTab(state.tabsByProject[projectId]) : undefined

    if (!projectId || key === undefined) return undefined

    const { kind, path } = tabTarget(key)

    return kind === 'history' ? state.historyFileByProject[projectId] : path
  })

/**
 * Файл последней выбранной вкладки этого вида: какой файл стоит в редакторе кода и какой - в
 * разнице, даже когда активна вкладка другого вида. undefined - таких вкладок нет.
 */
export const useRecentTab = (projectId: string | undefined, kind: TabTarget['kind']) =>
  useSelectionStore((state) => {
    const recent = (projectId && state.tabsByProject[projectId]?.recent) || NO_KEYS
    const key = recent.findLast((open) => tabTarget(open).kind === kind)

    return key === undefined ? undefined : tabTarget(key).path
  })

/** Ключи вкладок проекта в порядке на полосе. */
export const useEditorTabs = (projectId: string | undefined): readonly string[] =>
  useSelectionStore((state) =>
    projectId ? (state.tabsByProject[projectId]?.keys ?? NO_KEYS) : NO_KEYS,
  )

/** Где встать в выбранном файле проекта - для редактора. */
export const useSelectedPlace = (projectId: string | undefined) =>
  useSelectionStore((state) => (projectId ? state.selectedPlaceByProject[projectId] : undefined))

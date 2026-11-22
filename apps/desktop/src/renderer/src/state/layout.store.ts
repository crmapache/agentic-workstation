import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'

import { keptProjects, restoreProjects, switchedProject } from './layout-projects.utils'
import {
  LAYOUT_STORAGE_KEY,
  DEFAULT_PANEL_WIDTH,
  DEFAULT_PROJECT_VIEWS,
  DEFAULT_TERMINAL_SHARE,
} from './layout.constants'
import type {
  PanelSide,
  MainViewId,
  SideViewId,
  ViewAreaState,
  ProjectLayouts,
  ProviderViewId,
} from './layout.types'
import {
  isSideShown,
  arrangeLayout,
  resizedPanels,
  restoreLayout,
  makeRoomForMain,
  makeRoomForSide,
  resizedTerminalShare,
} from './layout.utils'

type LayoutStore = ProjectLayouts & {
  /**
   * Ширина, которую делят середина и правая колонка, и левая панель вместе с зазором за
   * ней, - её мерит Workbench. Не сохраняется: это окно, а не выбор человека. До первого
   * замера места сколько угодно - ничего не ужимается и не сворачивается.
   */
  room: number
  /**
   * Клик по иконке вида. Другой вид - показать его (и развернуть область). Тот же,
   * что уже показан, - свернуть или развернуть область. Так у обеих панелей и середины.
   * Область, которой не хватает места, не показана: клик по ней просит показать. Середине
   * панели ужимаются до места под неё, а в узком окне, где не хватает и на их минимумах,
   * сворачиваются (makeRoomForMain); левой панели уступает правая колонка (makeRoomForSide).
   */
  selectSideView: (viewId: SideViewId) => void
  /**
   * Показать вид левой панели, откуда бы ни позвали (дерево для найденного файла): уже видный не
   * трогается - повторный выбор вида свернул бы панель.
   * Развёрнутую, но спрятанную узким окном - показывает, как клик по иконке.
   */
  showSideView: (viewId: SideViewId) => void
  selectMainView: (viewId: MainViewId) => void
  /**
   * Показать вид в середине, откуда бы ни позвали (файл из дерева, коннекторы из меню
   * Claude Code): уже показанный не трогается - повторный выбор вида свернул бы середину.
   * Свёрнутую за нехваткой места разворачивает, ужимая или сворачивая панели.
   */
  showMainView: (viewId: MainViewId) => void
  selectProviderView: (viewId: ProviderViewId) => void
  /** Показать вид правой панели, откуда бы ни позвали: уже показанный не прячется. */
  showProviderView: (viewId: ProviderViewId) => void
  /** Сдвинуть ширину панели на delta пикселей с учётом пределов и места в окне. */
  resizePanel: (side: PanelSide, delta: number) => void
  /** Терминал внизу правой колонки (ADR 0037): показать или спрятать. */
  toggleTerminal: () => void
  setTerminalOpen: (isOpen: boolean) => void
  /**
   * Сдвинуть верх терминала на delta пикселей (вниз - плюс) в колонке высотой room - место
   * под оба листа без зазора между ними; его мерит сам терминал.
   */
  resizeTerminal: (delta: number, room: number) => void
  setRoom: (room: number) => void
  /**
   * Встать на раскладку проекта: прежняя откладывается под свой проект, у нового - его виды
   * (switchedProject). Зовёт смена активного проекта в кэше (followActiveProject) и переход в
   * проект из окна, не дожидаясь главного процесса. Тот же проект - ничего.
   */
  showProject: (projectId: string) => void
  /** Забыть виды закрытых проектов (keptProjects). */
  keepProjects: (projectIds: readonly string[]) => void
}

/** Левая панель с видом viewId - развёрнутая, с местом рядом с правой колонкой. */
const openSide = (state: LayoutStore, viewId: SideViewId): Partial<LayoutStore> => {
  const side = { ...state.side, activeViewId: viewId, isOpen: true }

  return { side, ...makeRoomForSide({ ...state, side }, state.room) }
}

const isSideViewShown = (state: LayoutStore, viewId: SideViewId) =>
  state.side.activeViewId === viewId && isSideShown(state, state.room)

const select = <Area extends ViewAreaState<string>>(
  area: Area,
  viewId: Area['activeViewId'],
): Area =>
  area.activeViewId === viewId
    ? { ...area, isOpen: !area.isOpen }
    : { ...area, activeViewId: viewId, isOpen: true }

/**
 * Раскладка окна: какой вид в каждой боковой панели и в середине, развёрнута ли
 * область, какой ширины панели и открыт ли терминал под правой панелью. Виды и что развёрнуто -
 * свои у каждого проекта, ширины - одни на окно. Чисто интерфейсное состояние - живёт в окне и
 * переживает перезапуск.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      side: { ...DEFAULT_PROJECT_VIEWS.side, width: DEFAULT_PANEL_WIDTH.side },
      main: DEFAULT_PROJECT_VIEWS.main,
      provider: { ...DEFAULT_PROJECT_VIEWS.provider, width: DEFAULT_PANEL_WIDTH.provider },
      terminal: { ...DEFAULT_PROJECT_VIEWS.terminal, share: DEFAULT_TERMINAL_SHARE },
      projectId: null,
      viewsByProject: {},
      room: Number.POSITIVE_INFINITY,

      selectSideView: (viewId) =>
        set((state) =>
          isSideViewShown(state, viewId)
            ? { side: { ...state.side, isOpen: false } }
            : openSide(state, viewId),
        ),
      showSideView: (viewId) =>
        set((state) => (isSideViewShown(state, viewId) ? state : openSide(state, viewId))),
      selectMainView: (viewId) =>
        set((state) => {
          const { isMainShown } = arrangeLayout(state, state.room)

          if (state.main.activeViewId === viewId && isMainShown) {
            return { main: { ...state.main, isOpen: false } }
          }

          return {
            main: { activeViewId: viewId, isOpen: true },
            ...makeRoomForMain(state, state.room),
          }
        }),
      showMainView: (viewId) =>
        set((state) =>
          state.main.activeViewId === viewId && arrangeLayout(state, state.room).isMainShown
            ? state
            : {
                main: { activeViewId: viewId, isOpen: true },
                ...makeRoomForMain(state, state.room),
              },
        ),
      selectProviderView: (viewId) =>
        set((state) => ({ provider: select(state.provider, viewId) })),
      showProviderView: (viewId) =>
        set((state) =>
          state.provider.isOpen && state.provider.activeViewId === viewId
            ? state
            : { provider: { ...state.provider, activeViewId: viewId, isOpen: true } },
        ),
      resizePanel: (side, delta) => set((state) => resizedPanels(state, state.room, side, delta)),
      toggleTerminal: () =>
        set((state) => ({ terminal: { ...state.terminal, isOpen: !state.terminal.isOpen } })),
      setTerminalOpen: (isOpen) =>
        set((state) =>
          state.terminal.isOpen === isOpen ? state : { terminal: { ...state.terminal, isOpen } },
        ),
      resizeTerminal: (delta, room) =>
        set((state) => ({
          terminal: {
            ...state.terminal,
            share: resizedTerminalShare(state.terminal.share, room, delta),
          },
        })),
      setRoom: (room) => set((state) => (state.room === room ? state : { room })),
      showProject: (projectId) => set((state) => switchedProject(state, projectId)),
      keepProjects: (projectIds) =>
        set((state) => {
          const viewsByProject = keptProjects(state.viewsByProject, projectIds)

          return viewsByProject === state.viewsByProject ? state : { viewsByProject }
        }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      partialize: ({ side, main, provider, terminal, projectId, viewsByProject }) => ({
        side,
        main,
        provider,
        terminal,
        projectId,
        viewsByProject,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...restoreLayout(persisted, current),
        ...restoreProjects(persisted),
      }),
    },
  ),
)

/** Видна ли середина окна: развёрнута и ей хватает места. Для getState() и селекторов. */
export const isMainShown = (state: LayoutStore) => arrangeLayout(state, state.room).isMainShown

/** Видна ли левая панель: развёрнута и влезает рядом с правой колонкой. */
export const isSidePanelShown = (state: LayoutStore) => isSideShown(state, state.room)

/** Раскладка на экране при нынешнем месте в окне - ширины панелей и видна ли середина. */
export const useArrangement = () =>
  useLayoutStore(useShallow((state) => arrangeLayout(state, state.room)))

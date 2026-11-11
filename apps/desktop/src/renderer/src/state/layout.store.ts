import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'

import { LAYOUT_STORAGE_KEY, DEFAULT_PANEL_WIDTH, DEFAULT_TERMINAL_SHARE } from './layout.constants'
import type {
  Layout,
  PanelSide,
  MainViewId,
  SideViewId,
  ViewAreaState,
  ProviderViewId,
} from './layout.types'
import {
  arrangeLayout,
  resizedPanels,
  restoreLayout,
  makeRoomForMain,
  resizedTerminalShare,
} from './layout.utils'

type LayoutStore = Layout & {
  /**
   * Ширина, которую делят левая панель, середина и правая панель, - её мерит Workbench.
   * Не сохраняется: это окно, а не выбор человека. До первого замера места сколько
   * угодно - ничего не ужимается и не сворачивается.
   */
  room: number
  /**
   * Клик по иконке вида. Другой вид - показать его (и развернуть область). Тот же,
   * что уже показан, - свернуть или развернуть область. Так у обеих панелей и середины.
   * Середина, которой не хватает места, не показана: клик по ней просит показать и
   * ужимает панели до места под неё.
   */
  selectSideView: (viewId: SideViewId) => void
  selectMainView: (viewId: MainViewId) => void
  /**
   * Показать вид в середине, откуда бы ни позвали (файл из дерева, коннекторы из меню
   * Claude Code): уже показанный не трогается - повторный выбор вида свернул бы середину.
   * Свёрнутую за нехваткой места разворачивает, ужимая панели.
   */
  showMainView: (viewId: MainViewId) => void
  selectProviderView: (viewId: ProviderViewId) => void
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
}

const select = <Area extends ViewAreaState<string>>(
  area: Area,
  viewId: Area['activeViewId'],
): Area =>
  area.activeViewId === viewId
    ? { ...area, isOpen: !area.isOpen }
    : { ...area, activeViewId: viewId, isOpen: true }

/**
 * Раскладка окна: какой вид в каждой боковой панели и в середине, развёрнута ли
 * область, какой ширины панели и открыт ли терминал под правой панелью. Чисто интерфейсное состояние - живёт в окне и
 * переживает перезапуск.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      side: { activeViewId: 'files', isOpen: true, width: DEFAULT_PANEL_WIDTH.side },
      main: { activeViewId: 'file', isOpen: true },
      provider: { activeViewId: 'claude-code', isOpen: true, width: DEFAULT_PANEL_WIDTH.provider },
      terminal: { isOpen: false, share: DEFAULT_TERMINAL_SHARE },
      room: Number.POSITIVE_INFINITY,

      selectSideView: (viewId) => set((state) => ({ side: select(state.side, viewId) })),
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
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      partialize: ({ side, main, provider, terminal }) => ({ side, main, provider, terminal }),
      merge: (persisted, current) => ({ ...current, ...restoreLayout(persisted, current) }),
    },
  ),
)

/** Видна ли середина окна: развёрнута и ей хватает места. Для getState() и селекторов. */
export const isMainShown = (state: LayoutStore) => arrangeLayout(state, state.room).isMainShown

/** Раскладка на экране при нынешнем месте в окне - ширины панелей и видна ли середина. */
export const useArrangement = () =>
  useLayoutStore(useShallow((state) => arrangeLayout(state, state.room)))

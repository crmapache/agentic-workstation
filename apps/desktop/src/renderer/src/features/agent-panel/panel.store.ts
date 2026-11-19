import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'

import type { DraftChip } from '@shared/message-draft'
import type { ProviderId } from '@shared/providers'

import { usePanelProvider } from '../../state/panel-provider.context'
import type { ComposerDraft } from './draft.types'
import { applyDraft, insertFieldChip } from './field-bus'
import { MENU_PARENT } from './panel.constants'
import type { MenuState, MenuScreen, RewindTarget } from './panel.types'

type PanelStore = {
  /** Растёт, когда поле ввода должно получить фокус (выбрали подсказку на приветствии). */
  focusRequest: number
  requestFocus: () => void
  /**
   * Положить текст или черновик с чипами в поле разговора (одним шагом его истории
   * отмен) и поставить туда курсор: «вернуть в поле», откат, подсказка. Ключ - разговор,
   * у проекта без разговоров - путь проекта (composer.store).
   */
  fillDraft: (key: string, content: string | ComposerDraft) => void
  /**
   * Чип в поле разговора - туда, где стояла каретка, своим шагом отмены, и клавиатура полю:
   * цитата из ленты (Quote), кусок файла из редактора (Send to Chat).
   */
  insertChip: (key: string, chip: DraftChip) => void
  /** Сообщение, к которому открыт диалог отката. */
  rewindTarget: RewindTarget | null
  openRewind: (target: RewindTarget) => void
  closeRewind: () => void
  /** Боковое меню панели (кнопка настроек в шапке): лист поверх разговора. */
  menu: MenuState
  /** Открыть меню сразу на экране (по умолчанию - корень): путь назад - к его родителю. */
  openMenu: (screen?: MenuScreen) => void
  /** Шаг внутрь: экран открывается с начала. */
  pickMenu: (screen: MenuScreen) => void
  /** Шаг назад - к родителю экрана, туда, где его оставили. */
  backMenu: () => void
  closeMenu: () => void
  /**
   * Вкладка, чьё имя сейчас набирают (поле на месте имени). Две двери: двойной клик и
   * `/rename` без имени. Одна за раз: открытие другой кладёт эту через уход фокуса.
   */
  naming: string | null
  setNaming: (conversationId: string | null) => void
  /**
   * Проекты, где человек закрыл последнюю вкладку: там экран «Let's start», а не новая
   * пустая вкладка сама собой.
   */
  emptied: Record<string, true>
  setEmptied: (projectPath: string, emptied: boolean) => void
}

const createPanelStore = () =>
  create<PanelStore>()((set) => ({
    focusRequest: 0,
    requestFocus: () => set((state) => ({ focusRequest: state.focusRequest + 1 })),
    fillDraft: (key, content) => {
      applyDraft(
        key,
        typeof content === 'string'
          ? { tokens: content ? [{ kind: 'text', value: content }] : [], quotes: [] }
          : content,
      )
      set((state) => ({ focusRequest: state.focusRequest + 1 }))
    },
    insertChip: (key, chip) => {
      insertFieldChip(key, chip)
      set((state) => ({ focusRequest: state.focusRequest + 1 }))
    },
    rewindTarget: null,
    openRewind: (rewindTarget) => set({ rewindTarget }),
    closeRewind: () => set({ rewindTarget: null }),
    menu: { open: false, screen: 'menu', back: false },
    openMenu: (screen = 'menu') => set({ menu: { open: true, screen, back: false } }),
    pickMenu: (screen) => set({ menu: { open: true, screen, back: false } }),
    backMenu: () =>
      set((state) => ({
        menu: { open: true, screen: MENU_PARENT[state.menu.screen], back: true },
      })),
    closeMenu: () => set({ menu: { open: false, screen: 'menu', back: false } }),
    naming: null,
    setNaming: (naming) => set({ naming }),
    emptied: {},
    setEmptied: (projectPath, emptied) =>
      set((state) => {
        const { [projectPath]: _previous, ...rest } = state.emptied

        return { emptied: emptied ? { ...rest, [projectPath]: true } : rest }
      }),
  }))

const stores = new Map<ProviderId, UseBoundStore<StoreApi<PanelStore>>>()

/** Стор панели провайдера - заводится при первом обращении и живёт, пока живо окно. */
export const panelStoreOf = (provider: ProviderId): UseBoundStore<StoreApi<PanelStore>> => {
  const known = stores.get(provider)

  if (known) return known

  const store = createPanelStore()

  stores.set(provider, store)

  return store
}

/**
 * Интерфейсное состояние панели провайдера (ADR 0083): меню, откат, имя вкладки, фокус поля,
 * опустевшие проекты. У каждой панели своё: обе смонтированы разом, и меню, открытое в
 * Codex, не открывается в Claude. Вне панели - Claude (PanelProviderContext по умолчанию).
 * Черновики поля - в composer.store, свет позвавших вкладок - в tab-calls.store; сами
 * разговоры - у главного процесса.
 */
export const usePanelStore = <T>(selector: (store: PanelStore) => T): T =>
  panelStoreOf(usePanelProvider())(selector)

/** Стор своей панели целиком - для обработчиков, которым нужно состояние на миг нажатия. */
export const usePanelStoreApi = (): UseBoundStore<StoreApi<PanelStore>> =>
  panelStoreOf(usePanelProvider())

import { create } from 'zustand'

import type { DraftChip } from '@shared/claude-draft'

import { MENU_PARENT } from './claude.constants'
import type { TabCall, MenuState, MenuScreen, RewindTarget } from './claude.types'
import { useComposerStore } from './composer.store'
import type { ComposerDraft } from './draft.types'
import { appendChip, EMPTY_DRAFT } from './draft.utils'
import { applyDraft } from './field-bus'

type ClaudeCodeStore = {
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
   * Дописать чип в конец поля разговора тем же шагом отмены, с прежними цитатами: цитата из
   * ленты (Quote), кусок файла из редактора (Send to Chat).
   */
  appendChip: (key: string, chip: DraftChip) => void
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
  /** Позвавшие вкладки и чем позвали - светятся, пока не ответили (tab-calls.hooks.ts). */
  calls: Record<string, TabCall>
  addCall: (conversationId: string, call: TabCall) => void
  /** Ответили (открыли вкладку, что-то сделали в ней) или её закрыли - свет гаснет. */
  answerCalls: (conversationIds: readonly string[]) => void
  /**
   * Проекты, где человек закрыл последнюю вкладку: там экран «Let's start», а не новая
   * пустая вкладка сама собой.
   */
  emptied: Record<string, true>
  setEmptied: (projectPath: string, emptied: boolean) => void
}

/**
 * Интерфейсное состояние панели Claude Code: меню, откат, фокус поля. Черновики поля -
 * в composer.store; сами разговоры - у главного процесса.
 */
export const useClaudeCodeStore = create<ClaudeCodeStore>()((set) => ({
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
  appendChip: (key, chip) => {
    const draft = useComposerStore.getState().drafts[key] ?? EMPTY_DRAFT

    useClaudeCodeStore
      .getState()
      .fillDraft(key, { tokens: appendChip(draft.tokens, chip), quotes: draft.quotes })
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
  calls: {},
  addCall: (conversationId, call) =>
    set((state) => ({ calls: { ...state.calls, [conversationId]: call } })),
  answerCalls: (conversationIds) =>
    set((state) =>
      conversationIds.some((id) => id in state.calls)
        ? {
            calls: Object.fromEntries(
              Object.entries(state.calls).filter(([id]) => !conversationIds.includes(id)),
            ),
          }
        : state,
    ),
  emptied: {},
  setEmptied: (projectPath, emptied) =>
    set((state) => {
      const { [projectPath]: _previous, ...rest } = state.emptied

      return { emptied: emptied ? { ...rest, [projectPath]: true } : rest }
    }),
}))

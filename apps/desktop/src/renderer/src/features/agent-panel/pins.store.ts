import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { PIN_LIMIT, PINS_STORAGE_KEY } from './pins.constants'
import { togglePin } from './pins.utils'

type PinsStore = {
  /**
   * Закреплённые по разговору: id элементов ленты в порядке закрепления (порядок нужен
   * одному - понять, полна ли полка). id элементов стабильны между перезапусками.
   */
  pins: Record<string, readonly string[]>
  toggle: (conversationId: string, itemId: string) => void
  /** Снять закрепы с ушедших элементов: откат унёс сообщение - уходит и его закреп. */
  unpin: (conversationId: string, itemIds: readonly string[]) => void
  /** Забыть разговоры, которых больше нет: закрытая вкладка уносит свои закрепы. */
  keepOnly: (conversationIds: readonly string[]) => void
}

const NO_PINS: readonly string[] = []

/**
 * Закреплённые сообщения над лентой - интерфейсное состояние разговора: переживают
 * перезагрузку окна и перезапуск IDE, уходят с закрытой вкладкой.
 */
export const usePinsStore = create<PinsStore>()(
  persist(
    (set) => ({
      pins: {},
      toggle: (conversationId, itemId) =>
        set((state) => {
          const current = state.pins[conversationId] ?? NO_PINS
          const next = togglePin(current, itemId)

          return next === current ? state : { pins: { ...state.pins, [conversationId]: next } }
        }),
      unpin: (conversationId, itemIds) =>
        set((state) => {
          const current = state.pins[conversationId] ?? NO_PINS
          const next = current.filter((id) => !itemIds.includes(id))

          return next.length === current.length
            ? state
            : { pins: { ...state.pins, [conversationId]: next } }
        }),
      keepOnly: (conversationIds) =>
        set((state) => {
          const kept = Object.entries(state.pins).filter(
            ([id, pinned]) => pinned.length > 0 && conversationIds.includes(id),
          )

          return kept.length === Object.keys(state.pins).length
            ? state
            : { pins: Object.fromEntries(kept) }
        }),
    }),
    { name: PINS_STORAGE_KEY },
  ),
)

/** Закреплённые разговора; нет - один и тот же пустой список (без лишних перерисовок). */
export const usePins = (conversationId: string): readonly string[] =>
  usePinsStore((store) => store.pins[conversationId] ?? NO_PINS)

/**
 * Булавка одного элемента ленты: закреплён ли, полна ли полка для него (закрепить нельзя,
 * пока не открепят другое) и переключатель. Одна на горящую кнопку в углу и пункт меню.
 */
export const usePin = (conversationId: string, itemId: string) => {
  const pins = usePins(conversationId)
  const toggle = usePinsStore((store) => store.toggle)
  const isPinned = pins.includes(itemId)

  return {
    isPinned,
    isCrowded: !isPinned && pins.length >= PIN_LIMIT,
    toggle: () => toggle(conversationId, itemId),
  }
}

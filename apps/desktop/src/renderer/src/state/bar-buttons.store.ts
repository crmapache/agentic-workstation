import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ActivityBarId } from '@shared/window'

import { BAR_BUTTONS_STORAGE_KEY, DEFAULT_BAR_ARRANGEMENT } from './bar-buttons.constants'
import type { BarGroup, BarArrangement, BarArrangements } from './bar-buttons.types'
import { withShown, restoreArrangements } from './bar-buttons.utils'

type BarButtonsStore = {
  bars: BarArrangements
  /** Новый порядок группы целиком - после перетаскивания (movedOrder). */
  arrange: (bar: ActivityBarId, group: BarGroup, order: string[]) => void
  /** Поставить кнопку в полосу или спрятать: меню правой кнопки на полосе и меню View. */
  setShown: (bar: ActivityBarId, id: string, shown: boolean) => void
  /** Вернуть полосе порядок и кнопки, как задумано в IDE. */
  reset: (bar: ActivityBarId) => void
}

const arrangementOf = (bars: BarArrangements, bar: ActivityBarId): BarArrangement =>
  bars[bar] ?? DEFAULT_BAR_ARRANGEMENT

/**
 * Кнопки трёх полос окна (ADR 0112): порядок, который человек выставил перетаскиванием, и
 * спрятанные. Одни на окно, а не на проект: это руки и привычка человека. Интерфейсное состояние,
 * как раскладка: живёт в localStorage, меню View - его зеркало.
 */
export const useBarButtonsStore = create<BarButtonsStore>()(
  persist(
    (set) => ({
      bars: {},
      arrange: (bar, group, order) =>
        set(({ bars }) => {
          const arrangement = arrangementOf(bars, bar)

          return {
            bars: {
              ...bars,
              [bar]: { ...arrangement, order: { ...arrangement.order, [group]: order } },
            },
          }
        }),
      setShown: (bar, id, shown) =>
        set(({ bars }) => {
          const arrangement = arrangementOf(bars, bar)

          return {
            bars: {
              ...bars,
              [bar]: { ...arrangement, hidden: withShown(arrangement.hidden, id, shown) },
            },
          }
        }),
      reset: (bar) =>
        set(({ bars }) => {
          const { [bar]: _reset, ...rest } = bars

          return { bars: rest }
        }),
    }),
    {
      name: BAR_BUTTONS_STORAGE_KEY,
      partialize: ({ bars }) => ({ bars }),
      merge: (persisted, current) => ({ ...current, bars: restoreArrangements(persisted) }),
    },
  ),
)

/** Раскладка кнопок одной полосы; не трогали - как задумано в IDE. */
export const useBarArrangement = (bar: ActivityBarId): BarArrangement =>
  useBarButtonsStore((state) => arrangementOf(state.bars, bar))

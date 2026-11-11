import type { MarkSteps } from './ChartTip.types'

/**
 * Какая метка графика следующая по клавише. В отличие от вкладок, по кругу не ходит: за
 * последним столбцом ничего нет, и прыжок на первый читался бы как ошибка. Ничего не
 * выбрано - начинаем с последней метки: самое свежее интереснее самого старого.
 */
export const nextMark = (
  key: string,
  current: number | null,
  count: number,
  steps: MarkSteps,
): number | null => {
  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1

  const step =
    key === 'ArrowRight'
      ? steps.across
      : key === 'ArrowLeft'
        ? -steps.across
        : key === 'ArrowDown' && steps.down !== null
          ? steps.down
          : key === 'ArrowUp' && steps.down !== null
            ? -steps.down
            : null

  if (step === null) return null
  if (current === null) return count - 1

  return Math.min(count - 1, Math.max(0, current + step))
}

/** Номер метки под указателем: ближайший предок с data-mark; мимо меток - null. */
export const markOf = (target: EventTarget | null): number | null => {
  const mark = target instanceof Element ? target.closest<HTMLElement>('[data-mark]') : null
  const value = mark?.dataset.mark

  return value === undefined ? null : Number(value)
}

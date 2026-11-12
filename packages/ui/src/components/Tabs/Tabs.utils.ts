import type { TabsOrientation } from './Tabs.types'

/**
 * Какая вкладка следующая по клавише. В отличие от меню, ряд вкладок замкнут:
 * вправо с последней - на первую, как велит паттерн tabs в WAI-ARIA. У столбца (vertical)
 * ходят стрелки вверх и вниз.
 */
export const nextTabIndex = (
  key: string,
  current: number,
  count: number,
  orientation: TabsOrientation = 'horizontal',
): number | null => {
  const [back, forward] =
    orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']

  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === forward) return (current + 1) % count
  if (key === back) return (current - 1 + count) % count

  return null
}

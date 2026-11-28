/**
 * Поколение модели числами: «6.1» - [6, 1]. Общее у драйверов, которые сами ставят меню моделей
 * новейшими вперёд (Codex, Kimi): их каталоги такого порядка не держат.
 */
export type Generation = readonly number[]

/** «6.1» → [6, 1]. */
export const parseGeneration = (text: string): number[] => text.split('.').map(Number)

/**
 * Насколько поколение a новее b: больше нуля - новее («6.1» новее «6», «6» новее «5.6»), ноль -
 * то же поколение. Недостающий номер - ноль: «6» и «6.0» равны.
 */
export const compareGenerations = (a: Generation, b: Generation): number => {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const step = (a[index] ?? 0) - (b[index] ?? 0)

    if (step !== 0) return step
  }

  return 0
}

import { MODEL_NAME_PATTERN } from '@shared/panel-prefs'

/** Почему имя не добавить: не годится для аргумента запуска или уже в списке. */
export type ModelNameProblem = 'invalid' | 'duplicate' | null

/**
 * Проверка набранного имени. Негодное отказывается, а не обрезается во что-то другое:
 * главный процесс его всё равно отбросил бы, а кнопка, которая ничего не добавляет,
 * хуже кнопки, которая не нажимается.
 */
export const modelNameProblem = (name: string, added: readonly string[]): ModelNameProblem => {
  if (!name) return null
  if (!MODEL_NAME_PATTERN.test(name) || name.startsWith('-')) return 'invalid'

  return added.includes(name) ? 'duplicate' : null
}

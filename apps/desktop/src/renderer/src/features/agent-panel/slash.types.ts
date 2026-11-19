/** Откуда команда: панель выполняет сама, встроенная в CLI, своя или проекта с диска. */
export type CommandGroup = 'panel' | 'built-in' | 'project'

/** Строка подсказки «/»: имя без «/», пояснение и синтаксис аргумента. */
export type CommandEntry = {
  id: string
  hint: string
  argumentHint?: string | undefined
  group: CommandGroup
}

/** Значение аргумента для второго шага подсказки (/model opus, /effort high). */
export type CommandOption = { id: string; hint: string }

/**
 * Выбранная строка подсказки - по имени, а не по месту: список меняется под рукой
 * (диск, новый ход), и место сдвинуло бы выбор на соседа. list - из какого списка
 * выбирали; by - стрелкой (решение) или мышью (просто проехала).
 */
export type HeldChoice = { id: string; list: string; by: 'key' | 'pointer' }

/** Команда, которую выполняет панель, а не CLI, и её аргумент. */
export type LocalCommand = { name: string; argument: string }

/** Команды панели (как в ACC): у каждой - своё действие в IDE. */
export type PanelCommandId =
  | 'resume'
  | 'fork'
  | 'login'
  | 'logout'
  | 'design-login'
  | 'rename'
  | 'config'
  | 'btw'
  | 'fast'
  | 'status'

/** Действие команды панели; аргумент - то, что набрано после имени. */
export type PanelAction = (argument: string) => void

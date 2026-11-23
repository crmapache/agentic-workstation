import type { SlashCommand } from './conversation'
import type { CommandHint } from './message-draft'

/**
 * Каталог «/» - одни правила для поля окна и для телефона (Remote Control): что из команд CLI
 * и найденного на диске можно предложить и в каком порядке. Окно добавляет сверху свои команды
 * панели, телефон - свои (их выполняет он сам).
 */

/** Откуда команда: панель выполняет сама, встроенная в CLI, своя или проекта с диска. */
export type CommandGroup = 'panel' | 'built-in' | 'project'

/** Строка подсказки «/»: имя без «/», пояснение и синтаксис аргумента. */
export type CommandEntry = {
  id: string
  hint: string
  argumentHint?: string | undefined
  group: CommandGroup
}

/**
 * Команды, которые CLI в режиме потока не выполняет, а честно отказывает, и запуск флота,
 * присланный сервером (только в сессиях, поднятых сервером): показывать их в подсказке -
 * обещать отказ. Служебные с «__» в начале не показываются тоже (`isOffered`).
 */
export const UNAVAILABLE_IN_STREAM: ReadonlySet<string> = new Set([
  'export',
  'permissions',
  'status',
  'workflow-launch-exec',
])

/** Начало имени служебной команды CLI (`__remote-workflow`): человеку её не набирать. */
export const INTERNAL_COMMAND_PREFIX = '__'

/** Синтаксис встроенных команд, где он есть (code-review - сверено с бинарником в ACC). */
export const BUILTIN_ARGUMENTS: Readonly<Record<string, string>> = {
  'code-review': '[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [<target>]',
  review: '[what to look at]',
}

/** Команду можно предложить: CLI в потоке её выполнит, и она не служебная. */
export const isOffered = (name: string): boolean =>
  !name.startsWith(INTERNAL_COMMAND_PREFIX) && !UNAVAILABLE_IN_STREAM.has(name)

/**
 * Команды CLI для проекта и свои команды CLI одним списком: проект - в порядке CLI, имя
 * без пояснения (из init или с диска IDE) берёт его и признак своей команды у своей
 * команды CLI; свои, которых проект ещё не назвал (до первого хода), - следом.
 */
export const withBuiltins = (
  project: readonly SlashCommand[],
  builtins: readonly SlashCommand[],
): SlashCommand[] => {
  const known = new Map(builtins.map((command) => [command.name, command]))
  const named = new Set(project.map((command) => command.name))

  return [
    ...project.map((command) =>
      command.description ? command : (known.get(command.name) ?? command),
    ),
    ...builtins.filter((command) => !named.has(command.name)),
  ]
}

/**
 * Каталог по порядку: команды панели, встроенные с пояснениями, команды от CLI (свои -
 * с меткой встроенной), потом найденное на диске и ещё не названное CLI - по имени, чтобы
 * тот же набор файлов не перерисовывал список в другом порядке. Файл с диска важнее
 * своего пояснения.
 */
export const buildCommands = (
  panel: readonly CommandEntry[],
  builtin: readonly CommandEntry[],
  cli: readonly SlashCommand[],
  disk: readonly CommandHint[],
): CommandEntry[] => {
  const hints = new Map(disk.map((hint) => [hint.name, hint]))
  const seen = new Set<string>()
  const entries: CommandEntry[] = []
  const add = (entry: CommandEntry) => {
    if (seen.has(entry.id)) return

    seen.add(entry.id)
    entries.push(entry)
  }

  for (const entry of panel) add(entry)

  for (const entry of builtin) {
    const hint = hints.get(entry.id)

    add({
      ...entry,
      hint: hint?.description || entry.hint,
      argumentHint: hint?.argumentHint || entry.argumentHint,
    })
  }

  for (const command of cli) {
    if (!isOffered(command.name)) continue

    const hint = hints.get(command.name)

    add({
      id: command.name,
      hint: hint?.description || command.description,
      argumentHint: hint?.argumentHint || command.argumentHint || undefined,
      group: command.builtin ? 'built-in' : 'project',
    })
  }

  const onDisk = disk
    .filter((hint) => !seen.has(hint.name) && isOffered(hint.name))
    .map((hint): CommandEntry => ({
      id: hint.name,
      hint: hint.description,
      argumentHint: hint.argumentHint || undefined,
      group: 'project',
    }))
    .sort((one, other) => (one.id < other.id ? -1 : one.id > other.id ? 1 : 0))

  return [...entries, ...onDisk]
}

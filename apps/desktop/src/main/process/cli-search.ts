import { posix, win32 } from 'node:path'

import { envValue } from '../windows/git-bash'
import type { Environment } from './shell-env'

/** Папка на Windows: переменная окружения (LOCALAPPDATA, USERPROFILE) и путь от неё. */
export type WindowsDir = readonly [variable: string, path: string]

/**
 * Что годится для запуска. program - только сама программа: обёртку npm (`.cmd`) заменяет её
 * `.exe`, а обёртка над скриптом не годится - через cmd.exe слова в аргументах ломались бы на
 * кавычках и процентах (Claude Code, программы расширений). program-or-batch - такая обёртка
 * запускается через cmd.exe (`launchTarget`): у Codex, OpenCode и агентов ACP аргументы задаёт IDE.
 */
export type CliLaunch = 'program' | 'program-or-batch'

/** Чем поиск смотрит на машину: подменяется в тестах (платформа, окружение, файлы). */
export type CliSearchDeps = {
  windows: boolean
  env: Environment
  isFile: (path: string) => Promise<boolean>
  /** Начало файла текстом или пусто: по нему обёртка `.cmd` называет программу, которую запускает. */
  readText: (path: string) => Promise<string>
}

/**
 * Папки Windows, куда CLI кладут установщики и менеджеры пакетов, даже когда PATH процесса IDE
 * их не знает: родной установщик Claude Code PATH не трогает вовсе, winget и npm дописывают его
 * только в реестр, а IDE несёт PATH того, кто её запустил (установщик из браузера, прошлая IDE
 * после самообновления). Переменной нет - папки нет.
 */
export const WINDOWS_CLI_DIRS: readonly WindowsDir[] = [
  // Родной установщик Claude Code: %USERPROFILE%\.local\bin\claude.exe.
  ['USERPROFILE', '.local\\bin'],
  // Ярлыки winget для portable-пакетов (Anthropic.ClaudeCode): на человека и на машину.
  ['LOCALAPPDATA', 'Microsoft\\WinGet\\Links'],
  ['ProgramFiles', 'WinGet\\Links'],
  // Глобальные пакеты npm, pnpm и Yarn; при nvm-windows npm кладёт их в папку активной node.
  ['APPDATA', 'npm'],
  ['LOCALAPPDATA', 'pnpm'],
  ['LOCALAPPDATA', 'Yarn\\bin'],
  ['NVM_SYMLINK', ''],
  // Scoop: своя папка (SCOOP), обычная, общая на машину; Chocolatey.
  ['SCOOP', 'shims'],
  ['USERPROFILE', 'scoop\\shims'],
  ['SCOOP_GLOBAL', 'shims'],
  ['ProgramData', 'scoop\\shims'],
  ['ChocolateyInstall', 'bin'],
  ['ProgramData', 'chocolatey\\bin'],
  ['USERPROFILE', '.bun\\bin'],
  ['LOCALAPPDATA', 'Volta\\bin'],
]

/** Программа, которую Windows запускает сама. */
const PROGRAM = /\.(exe|com)$/i

/** Обёртка, которую Windows запускает только через cmd.exe. */
const BATCH = /\.(cmd|bat)$/i

/** Путь в строке обёртки от её папки: `"%dp0%\…"` (npm) или `"%~dp0\…"` (pnpm, Yarn). */
const SHIM_PATH = /"%(?:~dp0|dp0%)\\*([^"\r\n]+)"/gi

/** node.exe рядом с обёрткой - чем она запускает скрипт, а не сама программа. */
const NODE = /(^|[\\/])node(\.exe)?$/i

/**
 * Папки PATH по порядку. На Windows - через «;», без пробелов и кавычек вокруг (`"C:\Program
 * Files\x"` в PATH бывает); только абсолютные: относительная папка ищется от рабочей папки IDE.
 */
export const pathDirs = (env: Environment, windows: boolean): string[] => {
  const path = windows ? win32 : posix

  return (envValue(env, 'PATH') ?? '')
    .split(windows ? ';' : ':')
    .map((dir) => (windows ? dir.trim().replace(/^"(.*)"$/, '$1') : dir))
    .filter((dir) => dir && path.isAbsolute(dir))
}

/** Папки Windows от их переменных окружения. */
export const windowsDirsOf = (dirs: readonly WindowsDir[], env: Environment): string[] =>
  dirs.flatMap(([variable, dir]) => {
    const base = envValue(env, variable)?.trim()

    return base && win32.isAbsolute(base) ? [win32.join(base, dir)] : []
  })

/** Где искать команду: PATH, на Windows - ещё папки её установщика (own) и общие папки CLI. */
export const commandDirs = (
  env: Environment,
  windows: boolean,
  own: readonly WindowsDir[] = [],
): string[] => [
  ...pathDirs(env, windows),
  ...(windows ? windowsDirsOf([...own, ...WINDOWS_CLI_DIRS], env) : []),
]

/**
 * Имена файла команды: на Windows сперва `.exe` (родной установщик, winget, Scoop), потом обёртка
 * `.cmd` (npm, pnpm, Yarn) - порядок PATHEXT. Имя с расширением - как есть.
 */
const commandFiles = (name: string, windows: boolean): string[] =>
  !windows || PROGRAM.test(name) || BATCH.test(name) ? [name] : [`${name}.exe`, `${name}.cmd`]

/** Файлы-кандидаты по порядку папок, без повторов (на Windows регистр букв пути не важен). */
export const candidatesIn = (dirs: readonly string[], name: string, windows: boolean): string[] => {
  const path = windows ? win32 : posix
  const unique = new Map<string, string>()

  for (const dir of dirs) {
    for (const file of commandFiles(name, windows)) {
      const full = path.join(dir, file)
      const key = windows ? full.toLowerCase() : full

      if (!unique.has(key)) unique.set(key, full)
    }
  }

  return [...unique.values()]
}

/**
 * Программа за обёрткой `.cmd` от npm, pnpm или Yarn - путь из её строки запуска от папки
 * обёртки; не обёртка менеджера пакетов - null. У обёртки над скриптом это скрипт (`codex.js`):
 * node.exe, которым она его запускает, пропускается.
 */
export const shimTarget = (text: string, shim: string): string | null => {
  for (const [, relative] of text.matchAll(SHIM_PATH)) {
    if (relative && !NODE.test(relative)) return win32.join(win32.dirname(shim), relative)
  }

  return null
}

/**
 * Что запускать по найденному файлу; не годится - null. Обёртку npm над программой (Claude Code
 * и OpenCode из npm: `claude.cmd` → `…\bin\claude.exe`) заменяет сама программа: Node без
 * оболочки `.cmd` не запускает (EINVAL), а через cmd.exe ломал бы аргументы. Обёртка над скриптом
 * (Codex из npm) остаётся собой, если её можно запустить через cmd.exe.
 */
export const launchableOf = async (
  file: string,
  deps: CliSearchDeps,
  launch: CliLaunch,
): Promise<string | null> => {
  if (!deps.windows || !BATCH.test(file)) return file

  const target = shimTarget(await deps.readText(file), file)

  if (target && PROGRAM.test(target) && (await deps.isFile(target))) return target

  return launch === 'program-or-batch' ? file : null
}

/** Первая запускаемая команда в папках по порядку; нет - null. */
export const findCommandIn = async (
  name: string,
  dirs: readonly string[],
  deps: CliSearchDeps,
  launch: CliLaunch,
): Promise<string | null> => {
  for (const file of candidatesIn(dirs, name, deps.windows)) {
    if (!(await deps.isFile(file))) continue

    const launchable = await launchableOf(file, deps, launch)

    if (launchable) return launchable
  }

  return null
}

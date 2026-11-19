import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'

import type { CliNeed } from '@shared/conversation'

import { IS_WINDOWS } from '../platform'
import { runQuiet, askShellFor, isExecutableFile } from '../process/binary-locator'
import type { Environment } from '../process/shell-env'
import { loginShellEnv } from '../process/shell-env'
import { envValue, findGitBash } from '../windows/git-bash'
import type { AcpCli, AcpAgent } from './acp-agent'

/** Первая версия вида `1.2.3` в выводе `--version`; нет - пусто. */
export const versionIn = (text: string): string => /(\d+\.\d+\.\d+)/.exec(text)?.[1] ?? ''

/** Версия не ниже порога (`major.minor.patch`); пустая - не знаем, считаем годной. */
export const atLeast = (version: string, minimum: string): boolean => {
  if (!version) return true

  const have = version.split('.').map(Number)
  const need = minimum.split('.').map(Number)

  for (let index = 0; index < 3; index += 1) {
    const a = have[index] ?? 0
    const b = need[index] ?? 0

    if (a !== b) return a > b
  }

  return true
}

/** Папка на Windows: переменная окружения (LOCALAPPDATA, USERPROFILE) и путь от неё. */
export type WindowsDir = readonly [variable: string, path: string]

/** Где искать CLI агента и что ему нужно, кроме него самого. */
export type AcpCliSpec = {
  /** Имя команды без расширения: `agy`, `kimi`. */
  name: string
  /** Папки установщика агента на маке - от домашней. */
  macDirs: readonly string[]
  /** Папки установщика агента на Windows. */
  windowsDirs: readonly WindowsDir[]
  /** Порог версии: ниже - другой протокол (Kimi 0.x и 1.x). */
  minimum: string
  /** На Windows CLI работает только с Git Bash; variable - переменная, которой человек называет свой bash.exe. */
  gitBash?: { variable: string }
}

/**
 * Папки Windows, где оказывается любой CLI, даже когда PATH процесса IDE их ещё не знает: IDE
 * открыта до установки, а установщик дописал PATH только в реестр. Ярлыки winget (portable-пакеты
 * ставятся так) для человека и для машины, глобальные пакеты npm и pnpm.
 */
const WINDOWS_COMMON_DIRS: readonly WindowsDir[] = [
  ['LOCALAPPDATA', 'Microsoft\\WinGet\\Links'],
  ['ProgramFiles', 'WinGet\\Links'],
  ['APPDATA', 'npm'],
  ['LOCALAPPDATA', 'pnpm'],
]

/** Чем поиск смотрит на машину: подменяется в тестах (платформа, окружение, файлы, процессы). */
export type LocatorDeps = {
  windows: boolean
  env: Environment
  home: string
  isFile: (path: string) => Promise<boolean>
  /** Вывод команды или пусто. */
  run: (file: string, args: string[]) => Promise<string>
  /** Путь от `command -v` оболочки входа; на Windows не зовётся. */
  askShell: (name: string) => Promise<string | null>
}

/** Итог поиска: CLI (или null) и чего ему не хватает, чтобы работать. */
export type AcpCliSearch = { cli: AcpCli | null; need: CliNeed | null }

/**
 * Имена файла CLI: на Windows сперва `.exe` (родной установщик, winget), потом обёртка `.cmd` из
 * npm или pnpm - в том же порядке Windows ищет сама (PATHEXT).
 */
const fileNames = (name: string, windows: boolean): string[] =>
  windows ? [`${name}.exe`, `${name}.cmd`] : [name]

/** Папки по порядку: PATH, папки установщика агента, на Windows - ещё общие папки CLI. */
const searchDirs = (spec: AcpCliSpec, deps: LocatorDeps): string[] => {
  const path = deps.windows ? win32 : posix
  const fromPath = (envValue(deps.env, 'PATH') ?? '')
    .split(deps.windows ? ';' : ':')
    .map((dir) => dir.trim())
    .filter((dir) => dir && path.isAbsolute(dir))
  const installers = deps.windows
    ? [...spec.windowsDirs, ...WINDOWS_COMMON_DIRS].flatMap(([variable, dir]) => {
        const base = envValue(deps.env, variable)?.trim()

        return base ? [win32.join(base, dir)] : []
      })
    : spec.macDirs.map((dir) => posix.join(deps.home, dir))

  return [...fromPath, ...installers]
}

/** Кандидаты по порядку, без повторов (на Windows регистр букв пути не важен). */
export const candidatesOf = (spec: AcpCliSpec, deps: LocatorDeps): string[] => {
  const path = deps.windows ? win32 : posix
  const unique = new Map<string, string>()

  for (const dir of searchDirs(spec, deps)) {
    for (const name of fileNames(spec.name, deps.windows)) {
      const file = path.join(dir, name)
      const key = deps.windows ? file.toLowerCase() : file

      if (!unique.has(key)) unique.set(key, file)
    }
  }

  return [...unique.values()]
}

/** Годный CLI по пути: файл есть и версия не ниже порога. */
const usable = async (
  binary: string,
  spec: AcpCliSpec,
  deps: LocatorDeps,
): Promise<AcpCli | null> => {
  if (!(await deps.isFile(binary))) return null

  const version = versionIn(await deps.run(binary, ['--version']))

  return atLeast(version, spec.minimum) ? { binary, env: deps.env, version } : null
}

/**
 * Найти CLI агента ACP: PATH login shell, папки установщика агента, на Windows - ещё ярлыки
 * winget и глобальные npm и pnpm, на маке - спросить саму оболочку (Homebrew и глобальный npm уже
 * в PATH: `loginShellEnv`). Берётся первый, чья версия не ниже порога: старый (Kimi 1.x из
 * Homebrew) говорит другим протоколом и не должен заслонять новый в своей папке. Нашёлся, но на
 * Windows нет Git Bash, который ему нужен, - CLI нет, а need скажет, что поставить.
 */
export const searchAcpCli = async (spec: AcpCliSpec, deps: LocatorDeps): Promise<AcpCliSearch> => {
  const candidates = candidatesOf(spec, deps)
  let cli: AcpCli | null = null

  for (const binary of candidates) {
    cli = await usable(binary, spec, deps)

    if (cli) break
  }

  if (!cli && !deps.windows) {
    const answer = await deps.askShell(spec.name)

    if (answer && !candidates.includes(answer)) cli = await usable(answer, spec, deps)
  }

  if (cli && deps.windows && spec.gitBash && !(await findGitBash(spec.gitBash.variable, deps))) {
    return { cli: null, need: 'git-bash' }
  }

  return { cli, need: null }
}

/** Эта машина: окружение оболочки входа и настоящие файлы и процессы. */
const machine = async (): Promise<LocatorDeps> => {
  const env = await loginShellEnv()

  return {
    windows: IS_WINDOWS,
    env,
    home: homedir(),
    isFile: isExecutableFile,
    run: (file, args) => runQuiet(file, args, env),
    askShell: (name) => askShellFor(name, env),
  }
}

/**
 * CLI агента для драйвера: где он (locate) и чего ему не хватает (needs - для экрана «не
 * найден»). Ищется заново на каждый вопрос: его могли поставить, пока IDE открыта.
 */
export const acpCli = (spec: AcpCliSpec): Pick<AcpAgent, 'locate' | 'needs'> => ({
  locate: async () => (await searchAcpCli(spec, await machine())).cli,
  needs: async () => (await searchAcpCli(spec, await machine())).need,
})

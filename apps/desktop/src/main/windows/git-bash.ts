import { win32 } from 'node:path'

import type { Environment } from '../process/shell-env'

/** Чем поиск Git Bash смотрит на машину: подменяется в тестах. */
export type GitBashDeps = {
  env: Environment
  isFile: (path: string) => Promise<boolean>
  /** Вывод команды или пусто (`git --exec-path`). */
  run: (file: string, args: string[]) => Promise<string>
}

/** Папки MSYS2 внутри Git for Windows: по ним из `git --exec-path` находится корень Git. */
const MINGW_PREFIXES = new Set(['mingw32', 'mingw64', 'ucrt64', 'clang64', 'clangarm64'])

/** Значение переменной окружения без учёта регистра имени: на Windows `Path` и `PATH` - одно. */
export const envValue = (env: Environment, name: string): string | undefined => {
  const key = Object.keys(env).find((one) => one.toUpperCase() === name.toUpperCase())

  return key === undefined ? undefined : env[key]
}

const fromGitRoot = (root: string): string[] => [
  win32.join(root, 'bin', 'bash.exe'),
  win32.join(root, 'usr', 'bin', 'bash.exe'),
]

/** git.exe в `<корень>\cmd` или `<корень>\bin` - Git for Windows: bash рядом, в корне. */
const fromGitExe = (gitExe: string): string[] => {
  const dir = win32.dirname(win32.normalize(gitExe))
  const name = win32.basename(dir).toLowerCase()

  return name === 'cmd' || name === 'bin' ? fromGitRoot(win32.dirname(dir)) : []
}

/** Корень Git по `git --exec-path` (`…\mingw64\libexec\git-core`) - для git за обёрткой (Scoop). */
const fromExecPath = (execPath: string): string[] => {
  const parts = win32.normalize(execPath).split('\\')
  const prefix = parts.findLastIndex((part) => MINGW_PREFIXES.has(part.toLowerCase()))

  return prefix > 0
    ? fromGitRoot(parts.slice(0, prefix).join('\\'))
    : fromGitRoot(win32.join(execPath, '..', '..'))
}

/** Обычные места установщика Git for Windows: на всех дисках C, на одного человека - в LOCALAPPDATA. */
const standardPlaces = (env: Environment): string[] => {
  const local = envValue(env, 'LOCALAPPDATA')?.trim()

  return [
    ...fromGitRoot('C:\\Program Files\\Git'),
    ...fromGitRoot('C:\\Program Files (x86)\\Git'),
    ...(local ? fromGitRoot(win32.join(local, 'Programs', 'Git')) : []),
  ]
}

/** Все git.exe из PATH по порядку, без повторов и без относительных папок. */
const gitsInPath = async (deps: GitBashDeps): Promise<string[]> => {
  const found = new Map<string, string>()

  for (const raw of (envValue(deps.env, 'PATH') ?? '').split(';')) {
    const dir = raw.trim()

    if (!dir || !win32.isAbsolute(dir)) continue

    const git = win32.join(dir, 'git.exe')

    if (!found.has(git.toLowerCase()) && (await deps.isFile(git))) found.set(git.toLowerCase(), git)
  }

  return [...found.values()]
}

const firstExisting = async (paths: string[], deps: GitBashDeps): Promise<string | null> => {
  for (const path of paths) if (await deps.isFile(path)) return path

  return null
}

/**
 * Git Bash, которым Kimi Code на Windows выполняет команды; нет - null: без него Kimi не открывает
 * сессию («Git Bash was not found»). Порядок - как у самого Kimi 2.7 (agent-core
 * `locateWindowsGitBash`), иначе IDE сказала бы «нет», когда Kimi его находит, или наоборот:
 * переменная, которой человек называет свой bash.exe (variable), git.exe из PATH и bash рядом с
 * ним, корень по `git --exec-path`, потом обычные места установщика Git for Windows.
 */
export const findGitBash = async (variable: string, deps: GitBashDeps): Promise<string | null> => {
  const named = envValue(deps.env, variable)?.trim()

  if (named && (await deps.isFile(named))) return named

  for (const git of await gitsInPath(deps)) {
    const nearby = await firstExisting(fromGitExe(git), deps)

    if (nearby) return nearby

    const execPath = (await deps.run(git, ['--exec-path']))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    const rooted = execPath ? await firstExisting(fromExecPath(execPath), deps) : null

    if (rooted) return rooted
  }

  return firstExisting(standardPlaces(deps.env), deps)
}

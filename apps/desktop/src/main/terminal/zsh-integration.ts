import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

import { ZSH_FILES, USER_ZDOTDIR_ENV } from './zsh-integration.constants'

/** Файл обёртки переписывается, только если он не такой: новая версия IDE принесла другой. */
const keepFile = async (path: string, content: string) => {
  const current = await readFile(path, 'utf8').catch(() => null)

  if (current !== content) await writeFile(path, content, { mode: 0o644 })
}

/** Кладёт файлы обёртки zsh в dir. Zsh читает их с диска, из app.asar он не может. */
export const prepareZshIntegration = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true })
  await Promise.all(
    Object.entries(ZSH_FILES).map(([name, content]) => keepFile(join(dir, name), content)),
  )
}

/**
 * Окружение, которое заводит оболочку через обёртку: только для zsh (оболочка macOS по
 * умолчанию). Свой ZDOTDIR человека обёртка вернёт ему в конце запуска.
 */
export const zshIntegrationEnv = (
  shell: string,
  base: Readonly<Record<string, string>>,
  dir: string,
): Record<string, string> =>
  basename(shell) === 'zsh' ? { ZDOTDIR: dir, [USER_ZDOTDIR_ENV]: base['ZDOTDIR'] ?? '' } : {}

/**
 * Окружение оболочки терминала с обёрткой zsh: файлы обёртки сверяются перед каждой
 * оболочкой (их могли стереть вместе с userData). Не записались - оболочка без обёртки,
 * просто без цветного приглашения.
 */
export const withZshIntegration =
  (dir: string, baseEnv: () => Record<string, string>) =>
  async (shell: string): Promise<Record<string, string>> => {
    const env = baseEnv()

    try {
      await prepareZshIntegration(dir)
    } catch (error) {
      console.warn('[terminal] обёртка zsh не записалась:', error)

      return env
    }

    return { ...env, ...zshIntegrationEnv(shell, env, dir) }
  }

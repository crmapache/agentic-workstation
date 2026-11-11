import {
  PTY_NAME,
  TERM_PROGRAM,
  FALLBACK_LANG,
  PRIVATE_ENV_NAMES,
  PRIVATE_ENV_PREFIXES,
} from './terminal.constants'

const isPrivate = (name: string) =>
  (PRIVATE_ENV_NAMES as readonly string[]).includes(name) ||
  PRIVATE_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))

/**
 * Окружение оболочки терминала: окружение IDE без её личных переменных и тип терминала.
 * PATH и прочее из профиля оболочка соберёт сама - она запускается входной (-l).
 */
export const terminalEnv = (
  base: Readonly<Record<string, string | undefined>>,
  version: string,
): Record<string, string> => {
  const env: Record<string, string> = {}

  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && !isPrivate(name)) env[name] = value
  }

  return {
    ...env,
    TERM: PTY_NAME,
    COLORTERM: 'truecolor',
    TERM_PROGRAM,
    TERM_PROGRAM_VERSION: version,
    LANG: env['LANG'] || FALLBACK_LANG,
    // ls macOS красит вывод (папки, ссылки, исполняемые) только с этой переменной.
    CLICOLOR: env['CLICOLOR'] ?? '1',
  }
}

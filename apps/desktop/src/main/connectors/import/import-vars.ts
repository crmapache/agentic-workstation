import type { ShellVariables } from '../command-line'

/** ${NAME} или ${NAME:-запасное} - подстановка в конфиге Claude Code. */
const CONFIG_VARIABLE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

/** Переменной нет в оболочке и запасного значения нет: сервер получил бы строку «${NAME}». */
export class MissingVariable extends Error {}

/**
 * Строка конфига с подставленными переменными окружения - как их раскрывает Claude Code:
 * ${NAME}, а пустая или не заданная с «:-» - запасное значение.
 */
export const expandConfigVariables = (text: string, env: ShellVariables): string =>
  text.replace(CONFIG_VARIABLE, (_match, name: string, fallback: string | undefined) => {
    const value = env[name]

    if (value !== undefined && (value !== '' || fallback === undefined)) return value

    if (fallback !== undefined) return fallback

    throw new MissingVariable(name)
  })

/** То же для словаря (env, заголовки): ключи как есть, значения - с подстановками. */
export const expandConfigMap = (
  map: Readonly<Record<string, string>>,
  env: ShellVariables,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(map).map(([name, value]) => [name, expandConfigVariables(value, env)]),
  )

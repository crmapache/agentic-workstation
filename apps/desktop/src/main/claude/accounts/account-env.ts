import type { Environment } from '../../process/shell-env'

/** Переменная CLI: где лежит вход. Не в --help, найдена ACC в бинарнике и проверена. */
export const DRAWER_VARIABLE = 'CLAUDE_SECURESTORAGE_CONFIG_DIR'

/**
 * Токены и ключи бьют хранилище входа: с ними ход шёл бы не на выбранный аккаунт, а
 * с пустым ANTHROPIC_API_KEY `claude -p` вовсе виснет. Поэтому для своего хранилища
 * они пустые, а не удалённые: окружение потом сливается с родительским.
 */
export const OUTRANKING = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']

/**
 * Окружение CLI для аккаунта. drawer null - обычный вход: переменной хранилища нет
 * вовсе (IDE могли запустить из терминала, где она стоит, - тогда CLI пошёл бы не туда).
 */
export const environmentFor = (base: Environment, drawer: string | null): Environment => {
  const { [DRAWER_VARIABLE]: _inherited, ...rest } = base

  if (drawer === null) return rest

  return {
    ...rest,
    ...Object.fromEntries(OUTRANKING.map((name) => [name, ''])),
    [DRAWER_VARIABLE]: drawer,
  }
}

import { assertString } from './validate'

/** Больше аккаунтов за раз окно не спрашивает: столько не бывает на экране. */
const MAX_USAGE_ACCOUNTS = 32

/** id аккаунта: свой (16 hex) или пустой - обычный вход (у Codex - единственный). */
export const assertAccountId = (value: unknown): string => {
  assertString(value, 'accountId')

  if (value !== '' && !/^[0-9a-f]{16}$/.test(value)) throw new Error('Недопустимый id аккаунта')

  return value
}

/** Имя аккаунта от человека: строка, не длиннее 80 знаков. */
export const assertAlias = (value: unknown): string => {
  assertString(value, 'alias')

  if (value.length > 80) throw new Error('Слишком длинное имя')

  return value
}

/** Список аккаунтов, чьи лимиты освежить. */
export const assertAccountIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > MAX_USAGE_ACCOUNTS) {
    throw new Error('Ожидался список аккаунтов')
  }

  return value.map(assertAccountId)
}

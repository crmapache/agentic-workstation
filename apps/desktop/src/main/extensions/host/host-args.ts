/**
 * Разбор аргументов ручек: песочнице не верим, как окну. Ошибка - текстом для автора
 * расширения: он увидит её исключением своего вызова.
 */
export class HostArgError extends Error {}

export const text = (args: Record<string, unknown>, name: string, max = 10_000): string => {
  const value = args[name]

  if (typeof value !== 'string' || value.length === 0)
    throw new HostArgError(`"${name}" must be a non-empty string.`)
  if (value.length > max) throw new HostArgError(`"${name}" is longer than ${max} characters.`)

  return value
}

export const optionalText = (
  args: Record<string, unknown>,
  name: string,
  max = 10_000,
): string | null =>
  args[name] === undefined || args[name] === null || args[name] === ''
    ? null
    : text(args, name, max)

/** Строка, которая может быть пустой (текст файла, вставка в редактор). */
export const anyText = (args: Record<string, unknown>, name: string, max: number): string => {
  const value = args[name]

  if (typeof value !== 'string') throw new HostArgError(`"${name}" must be a string.`)
  if (value.length > max) throw new HostArgError(`"${name}" is longer than ${max} characters.`)

  return value
}

export const flag = (args: Record<string, unknown>, name: string, fallback = false): boolean => {
  const value = args[name]

  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new HostArgError(`"${name}" must be true or false.`)

  return value
}

export const count = (
  args: Record<string, unknown>,
  name: string,
  range: { min: number; max: number; fallback: number },
): number => {
  const value = args[name]

  if (value === undefined || value === null) return range.fallback
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new HostArgError(`"${name}" must be a number.`)

  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

export const handlerOf = (args: Record<string, unknown>): number => {
  const value = args['handler']

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HostArgError('A callback is missing.')
  }

  return value
}

/** Имя вклада внутри расширения: команда, вид, пункт строки, инструмент. */
const LOCAL_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/

export const localId = (args: Record<string, unknown>, name = 'id'): string => {
  const value = text(args, name, 48)

  if (!LOCAL_ID.test(value)) {
    throw new HostArgError(
      `"${name}" must start with a letter and use letters, digits, "_" or "-".`,
    )
  }

  return value
}

export const record = (args: Record<string, unknown>, name: string): Record<string, unknown> => {
  const value = args[name]

  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value))
    throw new HostArgError(`"${name}" must be an object.`)

  return value as Record<string, unknown>
}

export const list = (args: Record<string, unknown>, name: string): unknown[] => {
  const value = args[name]

  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new HostArgError(`"${name}" must be an array.`)

  return value
}

import type { SpecAuth, SpecTool } from '@shared/connector-spec'

import { ArgumentError } from '../native-tools'
import { pathArguments } from './http-spec'

/** Ключ коннектора: токен, значение заголовка или пароль Basic с логином. */
export type HttpCredentials = { secret: string; username: string }

export type BuiltRequest = { url: string; init: RequestInit }

/** Значение аргумента строкой: числа и да-нет как есть, объект - JSON. */
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value

  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  return JSON.stringify(value)
}

const asQueryValue = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(asQueryValue)

  return value === null || value === undefined ? [] : [textOf(value)]
}

const authHeaders = (auth: SpecAuth, credentials: HttpCredentials): Record<string, string> => {
  if (auth.type === 'bearer') return { Authorization: `Bearer ${credentials.secret}` }

  if (auth.type === 'header') return { [auth.name]: credentials.secret }

  if (auth.type === 'basic') {
    const pair = `${credentials.username}:${credentials.secret}`

    return { Authorization: `Basic ${Buffer.from(pair, 'utf8').toString('base64')}` }
  }

  return {}
}

/**
 * Запрос инструмента из описания: аргументы пути - экранированными (и не «.» или «..»),
 * параметры адреса и тело JSON - только перечисленные в описании, ключ - от IDE. Итоговый
 * адрес обязан остаться на baseUrl: иначе ключ ушёл бы чужому хосту.
 */
export const buildRequest = (
  baseUrl: string,
  auth: SpecAuth,
  tool: SpecTool,
  args: Record<string, unknown>,
  credentials: HttpCredentials,
): BuiltRequest => {
  let path = tool.path

  for (const name of pathArguments(tool.path)) {
    const value = args[name]

    if (value === undefined || value === null || value === '') {
      throw new ArgumentError(`"${name}" is required`)
    }

    const text = textOf(value)

    if (text === '.' || text === '..') throw new ArgumentError(`"${name}" is not a valid value`)

    path = path.replace(`{${name}}`, encodeURIComponent(text))
  }

  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/$/, '')
  const url = new URL(`${basePath}${path}`, base.origin)

  for (const name of tool.query) {
    for (const value of asQueryValue(args[name])) url.searchParams.append(name, value)
  }

  if (auth.type === 'query') url.searchParams.set(auth.name, credentials.secret)

  // Сравнение по сегменту: «/v1» не должен пускать на «/v10».
  if (url.origin !== base.origin || !`${url.pathname}/`.startsWith(`${basePath}/`)) {
    throw new ArgumentError('The request left the service address')
  }

  const body = Object.fromEntries(
    tool.body.filter((name) => args[name] !== undefined).map((name) => [name, args[name]]),
  )
  const hasBody = tool.method !== 'GET' && tool.method !== 'DELETE' && tool.body.length > 0

  return {
    url: url.toString(),
    init: {
      method: tool.method,
      headers: {
        Accept: 'application/json',
        ...authHeaders(auth, credentials),
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
      // Перенаправление на другой хост унесло бы туда и ключ.
      redirect: 'error',
    },
  }
}

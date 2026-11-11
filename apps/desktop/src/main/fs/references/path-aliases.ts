import { posix } from 'node:path'

import type { PathAlias } from './resolve'

/** Конфиги TypeScript и JavaScript, где живут синонимы путей. */
const CONFIG_NAME = /(?:^|\/)(?:tsconfig(?:\.[\w-]+)?|jsconfig)\.json$/

/** Сколько ступеней extends пройти: цепочка длиннее - почти наверняка петля. */
const EXTENDS_DEPTH = 5

export const isPathConfig = (path: string): boolean => CONFIG_NAME.test(path)

/**
 * JSON с комментариями и висячими запятыми - как пишут tsconfig. Строки проходятся целиком:
 * «//» внутри адреса - не комментарий.
 */
export const parseJsonc = (text: string): unknown => {
  let out = ''
  let at = 0

  while (at < text.length) {
    const char = text[at]

    if (char === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y

      end.lastIndex = at

      const string = end.exec(text)?.[0] ?? text.slice(at)

      out += string
      at += string.length
    } else if (char === '/' && text[at + 1] === '/') {
      at = text.indexOf('\n', at)
      if (at < 0) break
    } else if (char === '/' && text[at + 1] === '*') {
      const close = text.indexOf('*/', at + 2)

      at = close < 0 ? text.length : close + 2
    } else {
      out += char
      at += 1
    }
  }

  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as unknown
  } catch {
    return null
  }
}

type Options = { baseUrl?: string; paths?: Record<string, string[]>; pathsFrom: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * baseUrl и paths конфига с учётом extends (только своего, внутри проекта): ближний конфиг
 * перекрывает дальний. pathsFrom - папка, от которой считаются пути синонимов: baseUrl, а без
 * него папка конфига, где paths записаны (так считает TypeScript 4.1+).
 */
const optionsOf = (
  path: string,
  read: (path: string) => string | null,
  depth = 0,
): Options | null => {
  const config = parseJsonc(read(path) ?? '')

  if (!isRecord(config)) return null

  const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path)
  const parent =
    typeof config['extends'] === 'string' &&
    config['extends'].startsWith('.') &&
    depth < EXTENDS_DEPTH
      ? optionsOf(
          posix.normalize(posix.join(dir, config['extends'].replace(/(?<!\.json)$/, '.json'))),
          read,
          depth + 1,
        )
      : null
  const own = isRecord(config['compilerOptions']) ? config['compilerOptions'] : {}
  const baseUrl =
    typeof own['baseUrl'] === 'string'
      ? posix.normalize(posix.join(dir, own['baseUrl']))
      : parent?.baseUrl
  const paths = isRecord(own['paths']) ? (own['paths'] as Record<string, string[]>) : parent?.paths
  const pathsFrom = isRecord(own['paths']) ? dir : (parent?.pathsFrom ?? dir)

  return {
    ...(baseUrl === undefined ? {} : { baseUrl: baseUrl === '.' ? '' : baseUrl }),
    ...(paths === undefined ? {} : { paths }),
    pathsFrom,
  }
}

/**
 * Синонимы путей всех конфигов проекта. Действуют для файлов под папкой конфига; пути целей -
 * от корня проекта. Конфиг не прочитался или синонимов нет - ничего.
 */
export const pathAliases = (
  configs: readonly string[],
  read: (path: string) => string | null,
): PathAlias[] =>
  configs.flatMap((config) => {
    const options = optionsOf(config, read)

    if (!options?.paths) return []

    const from = options.baseUrl ?? options.pathsFrom
    const scope = posix.dirname(config) === '.' ? '' : posix.dirname(config)

    return Object.entries(options.paths).flatMap(([key, targets]) => {
      if (!Array.isArray(targets) || key.split('*').length > 2) return []

      const [prefix = '', suffix = ''] = key.split('*')

      return [
        {
          scope,
          prefix,
          suffix,
          wildcard: key.includes('*'),
          targets: targets
            .filter((target): target is string => typeof target === 'string')
            .map((target) => posix.normalize(posix.join(from, target))),
        },
      ]
    })
  })

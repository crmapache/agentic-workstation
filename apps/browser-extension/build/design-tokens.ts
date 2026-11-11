import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

/**
 * Токены дизайн-системы в расширении (ADR 0006, 0040). Стили расширения пишутся так же, как в
 * IDE, - только `var(--...)` (держит stylelint), а значения при сборке копируются из
 * packages/ui/src/styles/tokens.css: в окно расширения и в курсор на чужой странице их
 * больше неоткуда взять. Берутся только нужные файлу токены и то, на что они ссылаются.
 */

const VAR_REFERENCE = /var\(\s*(--[\w-]+)/g

type Rule = { prelude: string; body: string }

/** Правила верхнего уровня текста: заголовок до `{` и тело до парной `}`. */
const topLevelRules = (text: string): Rule[] => {
  const rules: Rule[] = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = 0
  let prelude = ''

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === '{') {
      if (depth === 0) {
        prelude = text.slice(preludeStart, index).trim()
        bodyStart = index + 1
      }

      depth += 1
    } else if (char === '}') {
      depth -= 1

      if (depth === 0) {
        rules.push({ prelude, body: text.slice(bodyStart, index) })
        preludeStart = index + 1
      }
    } else if (char === ';' && depth === 0) {
      preludeStart = index + 1
    }
  }

  return rules
}

/** `--имя: значение` из тела правила; многострочное значение - одной строкой. */
const declarations = (body: string): Map<string, string> => {
  const tokens = new Map<string, string>()
  let depth = 0
  let current = ''

  const add = () => {
    const colon = current.indexOf(':')
    const name = current.slice(0, colon).trim()

    if (colon > 0 && name.startsWith('--')) {
      tokens.set(
        name,
        current
          .slice(colon + 1)
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }

    current = ''
  }

  for (const char of body) {
    if (char === '(') depth += 1

    if (char === ')') depth -= 1

    if (char === ';' && depth === 0) add()
    else current += char
  }

  add()

  return tokens
}

const rootTokens = (rules: readonly Rule[]): Map<string, string> =>
  new Map(
    rules
      .filter((rule) => rule.prelude === ':root')
      .flatMap((rule) => [...declarations(rule.body)]),
  )

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Значения токенов: блоки `:root` верхнего уровня файла (не внутри @media). */
export const parseTokens = (css: string): Map<string, string> =>
  rootTokens(topLevelRules(withoutComments(css)))

/**
 * Значения для тех, кто попросил систему меньше двигать интерфейс: блок `:root` внутри
 * `@media (prefers-reduced-motion: reduce)` - его расширение повторяет так же, как IDE.
 */
export const parseReducedMotion = (css: string): Map<string, string> =>
  rootTokens(
    topLevelRules(withoutComments(css))
      .filter((rule) => /prefers-reduced-motion:\s*reduce/.test(rule.prelude))
      .flatMap((rule) => topLevelRules(rule.body)),
  )

/** Имена токенов, на которые ссылается текст. */
export const referencedTokens = (text: string): string[] => [
  ...new Set([...text.matchAll(VAR_REFERENCE)].map((match) => match[1] as string)),
]

/**
 * Нужные токены и всё, на что они ссылаются (роль → палитра). Неизвестный токен - ошибка
 * сборки: stylelint тоже его не пропустил бы.
 */
export const tokenClosure = (
  names: readonly string[],
  tokens: ReadonlyMap<string, string>,
): Map<string, string> => {
  const picked = new Map<string, string>()
  const queue = [...names]

  while (queue.length) {
    const name = queue.shift() as string

    if (picked.has(name)) continue

    const value = tokens.get(name)

    if (value === undefined) throw new Error(`Unknown design token ${name}`)

    picked.set(name, value)
    queue.push(...referencedTokens(value))
  }

  return picked
}

/**
 * Блок токенов перед стилями файла. `:host` - для курсора в закрытом shadow DOM чужой
 * страницы: свои значения перекрывают одноимённые переменные страницы, которые иначе
 * унаследовались бы внутрь.
 */
export const tokensBlock = (
  css: string,
  tokens: ReadonlyMap<string, string>,
  reducedMotion: ReadonlyMap<string, string> = new Map(),
): string => {
  const picked = tokenClosure(referencedTokens(css), tokens)

  if (!picked.size) return ''

  const block = (entries: [string, string][], indent: string) =>
    `${indent}:root,\n${indent}:host {\n${entries
      .map(([name, value]) => `${indent}  ${name}: ${value};`)
      .join('\n')}\n${indent}}\n`
  const reduced = [...reducedMotion].filter(([name]) => picked.has(name))

  return reduced.length
    ? `${block([...picked], '')}@media (prefers-reduced-motion: reduce) {\n${block(reduced, '  ')}}\n`
    : block([...picked], '')
}

/** Плагин Vite: каждому CSS расширения - свои токены в начало. */
export const designTokens = (tokensPath: string): Plugin => {
  const source = readFileSync(tokensPath, 'utf8')
  const tokens = parseTokens(source)
  const reducedMotion = parseReducedMotion(source)

  return {
    name: 'agentic-workstation-design-tokens',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css(\?.*)?$/.test(id) || id.includes('node_modules')) return null

      return { code: `${tokensBlock(code, tokens, reducedMotion)}${code}`, map: null }
    },
  }
}

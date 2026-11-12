import { posix } from 'node:path'

import type { Flavor } from './specifiers'

/**
 * Что есть в проекте: файлы и папки над ними, пути от корня через «/», и те же пути по
 * нижнему регистру - для поиска без учёта регистра.
 */
export type ProjectIndex = {
  files: ReadonlySet<string>
  dirs: ReadonlySet<string>
  filesByCase: ReadonlyMap<string, string>
  dirsByCase: ReadonlyMap<string, string>
}

/**
 * Как путь записан относительно файла, на который указал: целиком (exact), без расширения
 * (bare), с расширением .js у файла .ts (swapped, ESM в TypeScript), папкой вместо её index
 * (index), без подчёркивания частичного файла стилей (partial). По форме новый путь пишется так
 * же, как старый.
 */
export type SpecifierForm = 'exact' | 'bare' | 'swapped' | 'index' | 'partial'

/** Синоним путей из tsconfig/jsconfig: «@shared/*» → «apps/desktop/src/shared/*». */
export type PathAlias = {
  /** Папка конфига: синоним действует для файлов под ней. */
  scope: string
  /** Ключ: до звёздочки и после; без звёздочки - точное имя. */
  prefix: string
  suffix: string
  wildcard: boolean
  /** Куда ведёт: пути от корня проекта, звёздочка - на месте части после prefix. */
  targets: readonly string[]
}

/** Куда ведёт путь из текста и как его записать заново для нового места цели. */
export type Resolved = {
  target: string
  form: SpecifierForm
  /** Хвост «?inline», «#anchor» - переезжает как есть. */
  tail: string
  /** Как путь начинался: от файла, от корня проекта, через синоним. */
  base:
    | { kind: 'relative'; dotted: boolean }
    | { kind: 'root' }
    | { kind: 'alias'; alias: PathAlias; pattern: string }
  /**
   * Расширение, написанное в пути: .js у файла .ts при форме swapped; у частичного файла
   * стилей - было ли расширение вовсе.
   */
  written: string
  /**
   * Путь ссылки Markdown или HTML: был закодирован («%20») - новый кодируется так же, а с
   * пробелом кодируется всегда - иначе Markdown ссылку не узнает.
   */
  encoded: boolean
  markup: boolean
}

const SCRIPT_TRY = [
  '.ts',
  '.tsx',
  '.d.ts',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.json',
]

/** Расширение, которое TypeScript в ESM пишет вместо исходного: «./a.js» - это «a.ts». */
const SWAPS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

const STYLE_TRY = ['.scss', '.sass', '.css', '.less']

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Путь ссылки без «%20»; «100%.md» - не закодированный путь, а битый: такую ссылку не трогаем. */
const decodedPath = (path: string): string | null => {
  if (!path.includes('%')) return path

  try {
    return decodeURI(path)
  } catch {
    return null
  }
}

const splitTail = (spec: string): { path: string; tail: string } => {
  const cut = spec.search(/[?#]/)

  return cut < 0 ? { path: spec, tail: '' } : { path: spec.slice(0, cut), tail: spec.slice(cut) }
}

const extensionOf = (path: string, list: readonly string[]): string =>
  list.filter((extension) => path.endsWith(extension)).sort((a, b) => b.length - a.length)[0] ?? ''

type Found = { target: string; form: SpecifierForm; written: string }

/**
 * Файл или папка проекта по пути, как его записали, - без учёта регистра: на APFS «./Button» и
 * «./button» - один файл, а git после смены одного регистра помнит прежнее имя. Ответ - путь,
 * каким он стоит в списке файлов.
 */
const fileAt = (index: ProjectIndex, path: string): string | null =>
  index.files.has(path) ? path : (index.filesByCase.get(path.toLowerCase()) ?? null)

const dirAt = (index: ProjectIndex, path: string): string | null =>
  index.dirs.has(path) ? path : (index.dirsByCase.get(path.toLowerCase()) ?? null)

/** Первый найденный из кандидатов: путь и форма, в которой его записали. */
const firstOf = (
  index: ProjectIndex,
  candidates: readonly [string, SpecifierForm, string][],
): Found | null => {
  for (const [path, form, written] of candidates) {
    const target = fileAt(index, path)

    if (target) return { target, form, written }
  }

  return null
}

/** Файл кода по пути без синонима: как ищет сборщик - точно, с расширением, index папки. */
const findScript = (index: ProjectIndex, base: string): Found | null => {
  const written = extensionOf(base, Object.keys(SWAPS))
  const swapped = (SWAPS[written] ?? []).map((swap): [string, SpecifierForm, string] => [
    base.slice(0, -written.length) + swap,
    'swapped',
    written,
  ])
  const dir = dirAt(index, base)

  return firstOf(index, [
    [base, 'exact', ''],
    ...swapped,
    ...SCRIPT_TRY.map((extension): [string, SpecifierForm, string] => [
      base + extension,
      'bare',
      '',
    ]),
    ...(dir
      ? SCRIPT_TRY.map((extension): [string, SpecifierForm, string] => [
          `${dir}/index${extension}`,
          'index',
          '',
        ])
      : []),
  ])
}

/**
 * Файл стилей: точно, с расширением, частичный «_имя», index папки. written у частичного -
 * было ли в пути расширение: «_vars.scss» записан как «vars.scss».
 */
const findStyle = (index: ProjectIndex, base: string): Found | null => {
  const partial = posix.join(posix.dirname(base), `_${posix.basename(base)}`)

  return firstOf(index, [
    [base, 'exact', ''],
    [partial, 'partial', extensionOf(partial, STYLE_TRY)],
    ...STYLE_TRY.flatMap((extension): [string, SpecifierForm, string][] => [
      [base + extension, 'bare', ''],
      [partial + extension, 'partial', ''],
    ]),
    ...['_index.scss', 'index.scss', 'index.css'].map((name): [string, SpecifierForm, string] => [
      `${base}/${name}`,
      'index',
      '',
    ]),
  ])
}

/** Файл или папка по ссылке Markdown или HTML: только точно, без догадок о расширении. */
const findMarkup = (index: ProjectIndex, base: string): Found | null => {
  const target = fileAt(index, base) ?? dirAt(index, base)

  return target ? { target, form: 'exact', written: '' } : null
}

const inside = (path: string, scope: string) => scope === '' || path.startsWith(`${scope}/`)

/** Путь от синонима: подходящий ключ и первая цель, где файл нашёлся. */
const viaAlias = (
  index: ProjectIndex,
  aliases: readonly PathAlias[],
  from: string,
  path: string,
): { found: Found; alias: PathAlias; pattern: string } | null => {
  for (const alias of aliases) {
    if (!inside(from, alias.scope)) continue

    const fits = alias.wildcard
      ? path.startsWith(alias.prefix) &&
        path.endsWith(alias.suffix) &&
        path.length >= alias.prefix.length + alias.suffix.length
      : path === alias.prefix

    if (!fits) continue

    const star = alias.wildcard
      ? path.slice(alias.prefix.length, path.length - alias.suffix.length)
      : ''

    for (const pattern of alias.targets) {
      const found = findScript(index, posix.normalize(pattern.replace('*', star)))

      if (found) return { found, alias, pattern }
    }
  }

  return null
}

/** Куда ведёт путь spec из файла from; null - не в проект (пакет, адрес, нет такого файла). */
export const resolveSpecifier = (
  index: ProjectIndex,
  aliases: readonly PathAlias[],
  from: string,
  spec: string,
  flavor: Flavor,
): Resolved | null => {
  const { path, tail } = splitTail(spec)

  if (!path || SCHEME.test(path) || path.startsWith('//')) return null

  const dir = posix.dirname(from) === '.' ? '' : posix.dirname(from)

  if (flavor === 'markup') {
    const decoded = decodedPath(path)

    if (decoded === null) return null

    const rooted = decoded.startsWith('/')
    const base = posix
      .normalize(rooted ? decoded.slice(1) : posix.join(dir, decoded))
      .replace(/\/$/, '')
    const found = base.startsWith('..') ? null : findMarkup(index, base)

    return (
      found && {
        ...found,
        tail,
        encoded: decoded !== path,
        markup: true,
        base: rooted ? { kind: 'root' } : { kind: 'relative', dotted: path.startsWith('.') },
      }
    )
  }

  if (
    path.startsWith('.') ||
    (flavor === 'style' && !path.startsWith('/') && !path.startsWith('~'))
  ) {
    const base = posix.normalize(posix.join(dir, path))
    const found = base.startsWith('..')
      ? null
      : flavor === 'script'
        ? findScript(index, base)
        : findStyle(index, base)

    return (
      found && {
        ...found,
        tail,
        encoded: false,
        markup: false,
        base: { kind: 'relative', dotted: path.startsWith('.') },
      }
    )
  }

  if (flavor !== 'script') return null

  const aliased = viaAlias(index, aliases, from, path)

  return (
    aliased && {
      ...aliased.found,
      tail,
      encoded: false,
      markup: false,
      base: { kind: 'alias', alias: aliased.alias, pattern: aliased.pattern },
    }
  )
}

/** Новый путь до цели в той же форме, что старый: без расширения, папкой, частичным. */
const formed = (target: string, resolved: Resolved): string => {
  const name = posix.basename(target)

  if (resolved.form === 'index' && /^_?index\.[^.]+$/.test(name)) return posix.dirname(target)
  if (resolved.form === 'swapped')
    return target.slice(0, -extensionOf(target, SCRIPT_TRY).length) + resolved.written
  if (resolved.form === 'partial') {
    const plain = posix.join(posix.dirname(target), name.replace(/^_/, ''))

    const extension = extensionOf(plain, STYLE_TRY)

    return resolved.written || !extension ? plain : plain.slice(0, -extension.length)
  }
  if (resolved.form === 'bare' || resolved.form === 'index') {
    const extension = extensionOf(target, [...SCRIPT_TRY, ...STYLE_TRY])

    return extension ? target.slice(0, -extension.length) : target
  }

  return target
}

const relativeFrom = (from: string, path: string, dotted: boolean): string => {
  const dir = posix.dirname(from)
  const relative = posix.relative(dir === '.' ? '' : dir, path) || '.'

  return dotted && !relative.startsWith('.') ? `./${relative}` : relative
}

/**
 * Путь для файла, который теперь лежит в from, до цели, которая теперь в target, - как был
 * записан старый: от файла, от корня или через тот же синоним (цель ушла из-под синонима -
 * от файла).
 */
export const rewriteSpecifier = (resolved: Resolved, from: string, target: string): string => {
  const path = formed(target, resolved)
  const { base } = resolved
  const written = (text: string) =>
    resolved.encoded || (resolved.markup && /\s/.test(text)) ? encodeURI(text) : text

  if (base.kind === 'root') return `/${written(path)}${resolved.tail}`
  if (base.kind === 'relative') {
    return `${written(relativeFrom(from, path, base.dotted))}${resolved.tail}`
  }

  const [head = '', rest = ''] = base.pattern.split('*')

  if (base.alias.wildcard && path.startsWith(head) && path.endsWith(rest)) {
    const middle = path.slice(head.length, path.length - rest.length)

    return `${base.alias.prefix}${middle}${base.alias.suffix}${resolved.tail}`
  }

  // Цель ушла из-под синонима - путь от файла; точный путь к коду - без расширения: TypeScript
  // не берёт импорт с «.ts».
  const plain = resolved.form === 'exact' ? formed(target, { ...resolved, form: 'bare' }) : path

  return `${relativeFrom(from, plain, true)}${resolved.tail}`
}

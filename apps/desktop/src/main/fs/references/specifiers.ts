/**
 * Пути в тексте файла, которые указывают на другие файлы проекта: импорты и require в коде,
 * @use и url() в стилях, ссылки и картинки в Markdown, src и href в HTML. Находятся
 * выражениями, а не разбором языка: этого хватает, чтобы переименование в дереве переписало
 * ссылки, как WebStorm, и не тащить в главный процесс парсеры десятка языков.
 */

/** Как файл ссылается на другие: от этого - где искать пути и как их разрешать. */
export type Flavor = 'script' | 'style' | 'markup'

/** Путь в тексте: где стоит (без кавычек) и что написано. */
export type Specifier = { start: number; end: number; value: string }

const SCRIPT_EXTENSIONS = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'astro',
]

const STYLE_EXTENSIONS = ['css', 'scss', 'sass', 'less']

const MARKUP_EXTENSIONS = ['md', 'mdx', 'markdown', 'html', 'htm']

const FLAVORS: ReadonlyMap<string, Flavor> = new Map([
  ...SCRIPT_EXTENSIONS.map((extension) => [extension, 'script'] as const),
  ...STYLE_EXTENSIONS.map((extension) => [extension, 'style'] as const),
  ...MARKUP_EXTENSIONS.map((extension) => [extension, 'markup'] as const),
])

/** Как файл ссылается на другие, по расширению; null - в нём ссылок не ищем. */
export const flavorOf = (path: string): Flavor | null => {
  const dot = path.lastIndexOf('.')

  return dot < 0 ? null : (FLAVORS.get(path.slice(dot + 1).toLowerCase()) ?? null)
}

/**
 * Выражения по видам файлов. Группа с именем path - сам путь без кавычек. Импорты и экспорты
 * «from», голый import, import(), require(), подмена модуля в тестах (vi.mock, jest.mock), new
 * URL(…, import.meta.url); @use, @import, @forward и url() в стилях; ссылки и картинки Markdown
 * и src/href в разметке.
 */
const PATTERNS: Record<Flavor, readonly RegExp[]> = {
  script: [
    /\bfrom\s*(['"])(?<path>[^'"\n]+)\1/dg,
    /\bimport\s*(['"])(?<path>[^'"\n]+)\1/dg,
    /\bimport\s*\(\s*(['"])(?<path>[^'"\n]+)\1\s*[,)]/dg,
    /\brequire(?:\.resolve)?\s*\(\s*(['"])(?<path>[^'"\n]+)\1\s*\)/dg,
    /\b(?:vi|jest)\.(?:mock|doMock|unmock|importActual|requireActual)\s*\(\s*(['"])(?<path>[^'"\n]+)\1/dg,
    /\bnew\s+URL\s*\(\s*(['"])(?<path>[^'"\n]+)\1\s*,\s*import\.meta\.url/dg,
  ],
  style: [
    /@(?:use|import|forward)\s+(['"])(?<path>[^'"\n]+)\1/dg,
    /\burl\(\s*(['"]?)(?<path>[^'")\s]+)\1\s*\)/dg,
  ],
  markup: [
    /!?\[[^\]\n]*\]\(\s*<?(?<path>[^)\s>]+)>?(?:\s+["'][^"'\n]*["'])?\s*\)/dg,
    /\b(?:src|href)\s*=\s*(['"])(?<path>[^'"\n]+)\1/dg,
  ],
}

/** Все пути в тексте файла этого вида, по порядку и без повторов одного места. */
export const findSpecifiers = (text: string, flavor: Flavor): Specifier[] => {
  const found = new Map<number, Specifier>()

  for (const pattern of PATTERNS[flavor]) {
    for (const match of text.matchAll(pattern)) {
      const value = match.groups?.['path']
      // Место группы path по индексам совпадения (флаг d), а не поиском по строке: путь,
      // повторённый в подписи ссылки Markdown, иначе нашёлся бы в подписи.
      const start = match.indices?.groups?.['path']?.[0]

      if (!value || start === undefined) continue

      found.set(start, { start, end: start + value.length, value })
    }
  }

  return [...found.values()].sort((left, right) => left.start - right.start)
}

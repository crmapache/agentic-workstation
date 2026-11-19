import type { OpenFileRequest } from '../../state/open-file.context'
import type { FilePlace } from '../../state/selection.store'
import {
  WORDS,
  DOT_NAME,
  ROOTED_PATH,
  WEB_ADDRESS,
  DRIVE_PREFIX,
  PLACE_SUFFIX,
  NAME_EXTENSION,
  ADDRESS_TRAILING,
  EDGE_PUNCTUATION,
  KNOWN_EXTENSIONS,
  FORBIDDEN_IN_PATH,
} from './paths.constants'

/**
 * Путь, найденный в тексте: что просить открыть и папка ли это. Папку видно заранее
 * только по форме (слеш на конце, дот-имя) или по списку проекта - подсказке при
 * наведении ответ нужен до нажатия; настоящий ответ всё равно даёт диск.
 */
export type PathRef = { request: OpenFileRequest; folder: boolean }

/** Кусок текста для LinkedText: как есть, путь (открывается в IDE) или адрес сайта. */
export type LinkChunk =
  | { kind: 'text'; text: string }
  | { kind: 'url'; text: string }
  | { kind: 'path'; text: string; request: OpenFileRequest; folder: boolean }

/**
 * Что известно о файлах проекта - первый вопрос раньше любых правил формы: имя, которое
 * у проекта есть, - файл при любом расширении (`.gitignore`, `Makefile`, `app.iml`), а
 * `Node.js` в прозе - нет. Сравнение - по хвосту пути целыми кусками.
 */
export type KnownFiles = {
  hasFile: (path: string) => boolean
  hasFolder: (path: string) => boolean
}

/** Списка нет (витрина, проект ещё не ответил): решает одна форма. */
export const NO_KNOWN_FILES: KnownFiles = { hasFile: () => false, hasFolder: () => false }

/** Управляющих знаков в именах нет, а через них путь прячут от глаза. */
const hasControlChars = (text: string): boolean =>
  [...text].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)

/**
 * Можно ли вообще вести ссылку по этому пути. Сетевой (`//host/share`, `\\host`) - нет:
 * текст пишет агент, пересказывая файлы и страницы, а поход на чужой хост - не то, что
 * может сделать клик в чате. Адрес с схемой - тоже нет: он открывается в браузере.
 */
export const isOpenablePath = (path: string): boolean => {
  const trimmed = path.trim()

  return (
    trimmed !== '' &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('\\\\') &&
    !trimmed.includes('://') &&
    !hasControlChars(trimmed)
  )
}

/** Индекс по последнему куску пути: имя → пути от корня с этим именем. */
const indexByName = (paths: Iterable<string>): Map<string, string[]> => {
  const index = new Map<string, string[]>()

  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const same = index.get(name)

    if (!name) continue
    if (same) same.push(path)
    else index.set(name, [path])
  }

  return index
}

/** Папки, в которых лежат файлы списка: `a/b/c.ts` - это `a` и `a/b`. */
const foldersOf = (files: readonly string[]): Set<string> => {
  const folders = new Set<string>()

  for (const file of files) {
    for (let slash = file.indexOf('/'); slash > 0; slash = file.indexOf('/', slash + 1)) {
      folders.add(file.slice(0, slash))
    }
  }

  return folders
}

/** Есть ли в индексе написанное: голое имя - по имени, с папками - по хвосту пути. */
const lookUp = (index: Map<string, string[]>, path: string): boolean => {
  const written = path
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '')
  const name = written.slice(written.lastIndexOf('/') + 1)
  const paths = index.get(name)

  if (!paths) return false
  if (!written.includes('/')) return true

  return paths.some((candidate) => candidate === written || candidate.endsWith(`/${written}`))
}

/**
 * Список файлов проекта (тот же, что кормит «@»: пути от корня через «/») - в ответы
 * «есть такой файл / папка». Папок в списке нет, они берутся из путей файлов.
 */
export const knownFiles = (files: readonly string[]): KnownFiles => {
  const fileIndex = indexByName(files)
  const folderIndex = indexByName(foldersOf(files))

  return {
    hasFile: (path) => lookUp(fileIndex, path),
    hasFolder: (path) => lookUp(folderIndex, path),
  }
}

/** Число, которое написал человек; ноль и чепуха - как не написано. */
const positive = (text: string | undefined): number | undefined => {
  const value = Number(text)

  return text && Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * Место из хвоста ссылки. Колонка конца - только при колонке начала: `15:33-40` - кусок
 * строки, а `15-20` - кусок файла, и его конец - строка.
 */
const placeOf = (match: RegExpExecArray | null): FilePlace => {
  const line = positive(match?.[1])

  if (line === undefined) return {}

  const endLine = positive(match?.[2])
  const column = positive(match?.[3])
  const endColumn = column === undefined ? undefined : positive(match?.[4])

  return {
    line,
    ...(column === undefined ? {} : { column }),
    ...(endLine === undefined ? {} : { endLine }),
    ...(endColumn === undefined ? {} : { endColumn }),
  }
}

type Shape = {
  path: string
  separated: boolean
  trailing: boolean
  lastName: string
  extension: string | undefined
}

/** Форма пути: есть ли разделитель, слеш на конце, последнее имя и его расширение. */
const shapeOf = (path: string): Shape => {
  const pieces = path.split(/[/\\]/)
  const trailing =
    pieces.at(-1) === '' && pieces.some((piece) => piece !== '' && piece !== '.' && piece !== '..')
  const lastName = (trailing ? pieces.at(-2) : pieces.at(-1)) ?? ''

  return {
    path,
    separated: pieces.length > 1,
    trailing,
    lastName,
    extension: NAME_EXTENSION.exec(lastName)?.[1]?.toLowerCase(),
  }
}

/**
 * Папка ли это - и стоит ли она клика. Список проекта отвечает первым (со слешем внутри,
 * чтобы слово `utils` не стало ссылкой). Иначе форма - слеш на конце или дот-имя не из
 * известных дот-файлов - и путь от корня или дома: `foo/bar/` в комментарии - форма, а
 * не место. Номер строки после папки не пишут - с ним это файл.
 */
const isFolder = (shape: Shape, hasLine: boolean, known: KnownFiles): boolean => {
  if (hasLine) return false
  if (shape.separated && known.hasFolder(shape.path)) return true

  const dotFolder = DOT_NAME.test(shape.lastName) && !KNOWN_EXTENSIONS.has(shape.extension ?? '')

  return (shape.trailing || dotFolder) && ROOTED_PATH.test(shape.path)
}

/**
 * Путь в куске текста - или null. inCode - кусок в бэктиках: там голое `CLAUDE.md` -
 * файл. В прозе строже: нужен разделитель или номер строки, иначе «Node.js» стал бы
 * ссылкой; известный проекту файл - ссылка и в прозе, если в имени есть точка (скрипт
 * `build` иначе превратил бы слово «build» в ссылку во всех ответах).
 */
export const readPathRef = (
  text: string,
  inCode = true,
  known: KnownFiles = NO_KNOWN_FILES,
): PathRef | null => {
  const trimmed = text.trim().replace(EDGE_PUNCTUATION, '')

  if (!isOpenablePath(trimmed)) return null

  const suffix = PLACE_SUFFIX.exec(trimmed)
  const place = placeOf(suffix)
  const path = suffix ? trimmed.slice(0, suffix.index) : trimmed

  if (!path || FORBIDDEN_IN_PATH.test(path)) return null
  // Двоеточие где-то ещё - не путь: подпись, время, пропорция.
  if (path.slice(DRIVE_PREFIX.test(path) ? 2 : 0).includes(':')) return null

  const shape = shapeOf(path)
  const hasLine = place.line !== undefined
  const listed = !shape.trailing && (inCode || shape.extension !== undefined) && known.hasFile(path)

  if (!listed) {
    if (isFolder(shape, hasLine, known)) return { request: { path }, folder: true }
    if (!shape.extension) return null

    const pathLike = shape.separated || hasLine || (inCode && KNOWN_EXTENSIONS.has(shape.extension))

    if (!pathLike) return null
  }

  return { request: { path, ...place }, folder: false }
}

/**
 * Пути внутри обычного текста (своё сообщение, ошибка, блок кода): каждый символ
 * исходника возвращается по порядку, пунктуация фразы остаётся снаружи ссылки.
 */
export const splitPaths = (text: string, known: KnownFiles = NO_KNOWN_FILES): LinkChunk[] => {
  const chunks: LinkChunk[] = []
  let last = 0

  for (const match of text.matchAll(WORDS)) {
    const core = match[0].replace(EDGE_PUNCTUATION, '')
    const ref = core ? readPathRef(core, false, known) : null

    if (!ref) continue

    const start = match.index + match[0].indexOf(core)

    if (start > last) chunks.push({ kind: 'text', text: text.slice(last, start) })
    chunks.push({ kind: 'path', text: core, ...ref })
    last = start + core.length
  }

  if (last < text.length) chunks.push({ kind: 'text', text: text.slice(last) })

  return chunks
}

/**
 * Хвостовая пунктуация - фразы, а не адреса. Закрывающая скобка срезается, только если
 * ей нет пары внутри адреса: `(https://example.com/foo(bar))`.
 */
const trimAddress = (address: string): string => {
  let end = address.length

  while (end > 0 && ADDRESS_TRAILING.includes(address[end - 1] ?? '')) end -= 1

  while (end > 0 && address[end - 1] === ')') {
    const head = address.slice(0, end)
    const opens = head.split('(').length - 1
    const closes = head.split(')').length - 1

    if (opens >= closes) break
    end -= 1
  }

  return address.slice(0, end)
}

/**
 * Текст как есть, но с живыми ссылками: адреса http(s) и пути к файлам. Сначала
 * адреса - путь внутри адреса остаётся частью адреса. Склеив text всех кусков, получим
 * исходник символ в символ.
 */
export const splitLinks = (text: string, known: KnownFiles = NO_KNOWN_FILES): LinkChunk[] => {
  const chunks: LinkChunk[] = []
  let last = 0

  for (const match of text.matchAll(WEB_ADDRESS)) {
    const address = trimAddress(match[0])

    if (!address) continue
    if (match.index > last) chunks.push(...splitPaths(text.slice(last, match.index), known))
    chunks.push({ kind: 'url', text: address })
    last = match.index + address.length
  }

  if (last < text.length) chunks.push(...splitPaths(text.slice(last), known))

  return chunks
}

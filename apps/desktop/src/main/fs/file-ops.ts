import type { Stats } from 'node:fs'
import { cp, lstat, mkdir, rename, readdir, writeFile } from 'node:fs/promises'
import { posix, dirname } from 'node:path'

import type { EntryKind, FileOpCode, FileOpFailure, FileOpOutcome } from '@shared/file-ops'

import { resolveInsideRoot } from './project-paths'

/** Самое длинное имя, которое примет APFS, - в байтах UTF-8. */
const NAME_BYTES = 255

const failed = (code: FileOpCode): FileOpFailure => ({ ok: false, code })

/**
 * Путь от корня в том виде, в каком его пишет дерево: без «.», «..», двойных и крайних «/».
 * Окну не верим: «.» и «src/..» - это сам корень (в корзину ушёл бы весь проект), а
 * «./src/a.ts» не совпал бы с путями списка файлов, и ссылки молча не переписались бы.
 * Корень ('') - только там, где он и правда место (папка для нового и для вставки).
 */
export const placeOf = (root: string, path: string, rootAllowed = false): string | null => {
  if (path === '') return rootAllowed ? root : null

  const canonical =
    posix.normalize(path) === path &&
    path !== '.' &&
    !path.startsWith('../') &&
    !path.startsWith('/') &&
    !path.endsWith('/')

  return canonical ? resolveInsideRoot(root, path) : null
}

/** Имя одной части пути: не пустое, не «.» и «..», без нулевого символа и не длиннее предела. */
const isEntryName = (name: string): boolean =>
  name !== '' &&
  name !== '.' &&
  name !== '..' &&
  !name.includes('\0') &&
  Buffer.byteLength(name, 'utf8') <= NAME_BYTES

/**
 * Путь нового или переименованного элемента от корня проекта: части через «/», каждая -
 * годное имя. «ui/Button.tsx» в папке src - «src/ui/Button.tsx», как в WebStorm. null - имя
 * не годится.
 */
export const childPath = (parent: string, name: string): string | null => {
  const parts = name.trim().split('/')

  if (!parts.every(isEntryName)) return null

  return parent ? `${parent}/${parts.join('/')}` : parts.join('/')
}

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  )

/** Имя, как его сравнивает APFS: без регистра и в одной нормализации юникода. */
const spelling = (name: string) => name.normalize('NFC').toLowerCase()

/**
 * Имя копии в папке, где имя занято, - как Finder: «a copy.ts», «a copy 2.ts». У папки и у
 * файла без расширения - «a copy».
 */
export const copyName = (name: string, taken: ReadonlySet<string>): string => {
  const used = new Set([...taken].map(spelling))
  const isFree = (candidate: string) => !used.has(spelling(candidate))

  if (isFree(name)) return name

  const dot = name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']

  for (let number = 1; ; number += 1) {
    const candidate = `${stem} copy${number > 1 ? ` ${number}` : ''}${extension}`

    if (isFree(candidate)) return candidate
  }
}

/** Создать пустой файл или папку; папки по дороге создаются, занятое имя - отказ. */
export const createEntry = async (
  root: string,
  parent: string,
  name: string,
  kind: EntryKind,
): Promise<FileOpOutcome> => {
  const path = placeOf(root, parent, true) === null ? null : childPath(parent, name)
  const absolute = path === null ? null : placeOf(root, path)

  if (path === null || absolute === null) return failed('invalidName')
  if (await exists(absolute)) return failed('exists')

  try {
    if (kind === 'directory') {
      await mkdir(absolute, { recursive: true })
    } else {
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, '', { flag: 'wx' })
    }

    return { ok: true, path }
  } catch (error) {
    console.warn('[files] не создалось:', error)

    return failed('failed')
  }
}

/**
 * Можно ли перенести from в to: оба внутри проекта, from есть, to свободен, папка не уходит
 * внутрь себя. Смена одного регистра («foo.ts» → «Foo.ts») - не «занято»: на macOS это тот
 * же файл, и переименовать его надо.
 */
export const checkMove = async (
  root: string,
  from: string,
  to: string,
): Promise<{ from: string; to: string } | FileOpFailure> => {
  const source = placeOf(root, from)
  const target = placeOf(root, to)

  if (!source || !target || from === to) return failed('invalidName')
  if (to.startsWith(`${from}/`)) return failed('intoItself')

  // lstat, а не stat: ссылка и её цель - разные места. По stat у ссылки CLAUDE.md -> AGENTS.md
  // тот же inode, что у цели, и перенос ссылки на цель стёр бы настоящий файл.
  const [was, taken] = await Promise.all([
    lstat(source).catch(() => null),
    lstat(target).catch(() => null),
  ])

  if (!was) return failed('missing')
  if (taken && !(sameEntry(was, taken) && sameSpelling(from, to))) return failed('exists')

  return { from: source, to: target }
}

const sameEntry = (left: Stats, right: Stats) => left.ino === right.ino && left.dev === right.dev

/** Один путь в другом регистре или другой нормализации юникода - на macOS это то же место. */
const sameSpelling = (left: string, right: string) =>
  left.normalize('NFC').toLowerCase() === right.normalize('NFC').toLowerCase()

/** Перенести или переименовать; папка назначения создаётся, если её нет. */
export const moveEntry = async (root: string, from: string, to: string): Promise<FileOpOutcome> => {
  const checked = await checkMove(root, from, to)

  if ('ok' in checked) return checked

  try {
    await mkdir(dirname(checked.to), { recursive: true })
    await rename(checked.from, checked.to)

    return { ok: true, path: to }
  } catch (error) {
    console.warn('[files] не перенеслось:', error)

    return failed('failed')
  }
}

/** Копия файла или папки в папку toDirectory - под свободным именем. */
export const copyEntry = async (
  root: string,
  from: string,
  toDirectory: string,
): Promise<FileOpOutcome> => {
  const source = placeOf(root, from)
  const directory = placeOf(root, toDirectory, true)

  if (!source || !directory) return failed('invalidName')
  if (toDirectory === from || toDirectory.startsWith(`${from}/`)) return failed('intoItself')
  if (!(await exists(source))) return failed('missing')

  const taken = new Set(await readdir(directory).catch(() => []))
  const name = copyName(posix.basename(from), taken)
  const path = toDirectory ? `${toDirectory}/${name}` : name
  const target = placeOf(root, path)

  if (!target) return failed('invalidName')

  try {
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    })

    return { ok: true, path }
  } catch (error) {
    console.warn('[files] не скопировалось:', error)

    return failed('failed')
  }
}

/** В корзину системы: trash - shell.trashItem у Electron, в тестах - своя. */
export const trashEntry = async (
  root: string,
  path: string,
  trash: (absolute: string) => Promise<void>,
): Promise<FileOpOutcome> => {
  const absolute = placeOf(root, path)

  if (!absolute) return failed('invalidName')
  if (!(await exists(absolute))) return failed('missing')

  try {
    await trash(absolute)

    return { ok: true, path }
  } catch (error) {
    console.warn('[files] не ушло в корзину:', error)

    return failed('failed')
  }
}

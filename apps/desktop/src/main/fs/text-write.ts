import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { rm, open, stat, mkdir, rename, readFile, realpath } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

import type { TextHash, FileWrite, FileFailure, FileVersion } from '@shared/fs'

import { MISSING_CODES, PERMISSION_BITS } from './text-file.constants'
import {
  hashText,
  errorCode,
  failureOf,
  versionOf,
  decodeText,
  encodeText,
  insideRoot,
  outsideFile,
  relativeInside,
} from './text-file.utils'

const MISSING: FileWrite = { kind: 'missing' }

type WriteRequest = {
  text: string
  bom: boolean
  expected: FileVersion | null
  base?: TextHash | null
  outside?: boolean
}

/** Записи, которые ещё идут: выход из IDE ждёт их, иначе файл остался бы недописанным. */
const pending = new Set<Promise<unknown>>()

/** Сведения о файле; нет такого - null, другой сбой - ошибка. */
const statOrNull = (path: string): Promise<BigIntStats | null> =>
  stat(path, { bigint: true }).catch((error: unknown) => {
    if (MISSING_CODES.has(errorCode(error))) return null

    throw error
  })

/**
 * Поверх старого файла на месте: тот же файл, только когда переименование сломало бы
 * его - жёсткие ссылки, чужой владелец, нет прав на папку. Сначала байты, потом обрезка
 * по длине: читающий посреди записи не увидит пустой файл.
 */
const writeInPlace = async (target: string, bytes: Buffer): Promise<FileVersion> => {
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NONBLOCK)

  try {
    await handle.write(bytes, 0, bytes.length, 0)
    await handle.truncate(bytes.length)
    await handle.sync()

    return versionOf(await handle.stat({ bigint: true }))
  } finally {
    await handle.close()
  }
}

/**
 * Безопасная запись, как в WebStorm: новый текст - во временный файл рядом, с правами
 * старого, и переименованием на его место. Читающий видит либо старый файл целиком, либо
 * новый, а обрыв посреди записи не оставит полфайла. Версия - с самого записанного
 * файла, а не новым обращением по пути: чужая запись в ту же миллисекунду не выдаст себя
 * за нашу.
 */
const writeSafely = async (
  target: string,
  bytes: Buffer,
  previous: BigIntStats | null,
): Promise<FileVersion> => {
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx')

  try {
    await handle.write(bytes, 0, bytes.length, 0)
    if (previous) await handle.chmod(Number(previous.mode) & PERMISSION_BITS)
    await handle.sync()
    await rename(temporary, target)

    return versionOf(await handle.stat({ bigint: true }))
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  } finally {
    await handle.close()
  }
}

const saveBytes = async (target: string, bytes: Buffer, previous: BigIntStats | null) => {
  const ownFile =
    !previous || (previous.nlink === 1n && Number(previous.uid) === process.getuid?.())

  if (!ownFile) return writeInPlace(target, bytes)

  return writeSafely(target, bytes, previous).catch((error: unknown) => {
    // Папка без права записи: временный файл не создать - пишем на место.
    if (MISSING_CODES.has(errorCode(error))) throw error

    return writeInPlace(target, bytes)
  })
}

/**
 * На диске уже не та версия, от которой правили. Не конфликт, если на диске тот же текст,
 * что пишем, - файл записали тем же самым (тогда писать незачем), или тот, от которого
 * правили (base), - файл только тронули: touch, git stash и pop, lint-staged.
 */
const checkExpected = async (
  target: string,
  current: BigIntStats | null,
  { text, expected, base }: { text: string; expected: FileVersion; base: TextHash | null },
): Promise<FileWrite | 'write' | null> => {
  if (!current) return MISSING
  if (versionOf(current) === expected) return null

  const onDisk = decodeText((await readFile(target).catch(() => null)) ?? Buffer.alloc(0))

  if (onDisk?.text === text) {
    return { kind: 'saved', version: versionOf(current), hash: hashText(text) }
  }

  return base !== null && onDisk && hashText(onDisk.text) === base ? 'write' : { kind: 'conflict' }
}

/**
 * Можно ли писать в настоящий файл target: файл проекта - если он в проекте или человек
 * сам попросил (ссылка за проект), файл вне проекта - только по просьбе человека.
 */
type WriteGate = (target: string) => Promise<boolean>

const writeAt = async (
  absolute: string,
  label: string,
  { text, bom, expected, base = null }: WriteRequest,
  allowed: WriteGate,
): Promise<FileWrite> => {
  const bytes = encodeText(text, bom)

  try {
    const current = await statOrNull(absolute)

    if (current && !current.isFile()) return MISSING

    // Пишется настоящий файл: ссылка остаётся ссылкой.
    const target = current ? await realpath(absolute) : absolute

    if (!(await allowed(target))) return { kind: 'failed', reason: 'outside' }

    const verdict =
      expected === null ? null : await checkExpected(target, current, { text, expected, base })

    if (verdict && verdict !== 'write') return verdict

    return { kind: 'saved', version: await saveBytes(target, bytes, current), hash: hashText(text) }
  } catch (error) {
    if (MISSING_CODES.has(errorCode(error))) return MISSING

    return { kind: 'failed', reason: failureOf(error, label) }
  }
}

/** Запись в учёте идущих: выход из IDE её дождётся. */
const tracked = <T>(job: Promise<T>): Promise<T> => {
  const settle = () => void pending.delete(job)

  pending.add(job)
  // Отказ (негодный путь) уходит тому, кто позвал; учёт записей его не теряет и не ловит.
  job.then(settle, settle)

  return job
}

/** Файл проекта: в проекте - всегда, ссылкой за проект - только по просьбе человека. */
const writeProjectFile = async (rootPath: string, relativePath: string, request: WriteRequest) =>
  writeAt(insideRoot(rootPath, relativePath), relativePath, request, async (target) =>
    request.outside ? true : relativeInside(await realpath(rootPath), target) !== null,
  )

/** Файл вне проекта - только по просьбе человека, что бы ни прислало окно. */
const writeOutsideFile = async (path: string, request: WriteRequest) =>
  writeAt(outsideFile(path), path, request, () => Promise.resolve(request.outside === true))

/**
 * Записать текст файла проекта. С expected файл, который за это время поменял кто-то ещё,
 * не трогается (conflict); без него - пишется поверх (человек выбрал «оставить моё»).
 * Ссылка, ведущая за проект, пишется только по явной просьбе человека (outside, ⌘S):
 * автосохранение туда не ходит.
 */
export const writeTextFile = (
  rootPath: string,
  relativePath: string,
  request: WriteRequest,
): Promise<FileWrite> => tracked(writeProjectFile(rootPath, relativePath, request))

/**
 * Записать файл вне проекта (его открыли ссылкой) - только по явной просьбе человека
 * (outside, ⌘S), даже если окно по ошибке попросит автосохранение. Остальное - как у
 * файла проекта: версия, конфликт, безопасная запись. Путь проверяется заново.
 */
export const writeOutsideTextFile = (path: string, request: WriteRequest): Promise<FileWrite> =>
  tracked(writeOutsideFile(path, request))

/**
 * Байты файла проекта поверх того, что на диске, - возврат версии из локальной истории (ADR
 * 0045): та же безопасная запись и права старого файла, ссылка пишется в свою цель. Пропавший
 * файл появляется снова, вместе с папками над ним. Писать можно только внутри проекта - и
 * через ссылки тоже. На месте файла папка - occupied.
 */
const writeBytes = async (
  rootPath: string,
  relativePath: string,
  bytes: Buffer,
): Promise<'saved' | 'occupied' | FileFailure> => {
  try {
    const absolute = insideRoot(rootPath, relativePath)
    const realRoot = await realpath(rootPath)
    const current = await statOrNull(absolute)

    if (current && !current.isFile()) return 'occupied'
    if (!current) await mkdir(dirname(absolute), { recursive: true })

    const target = current
      ? await realpath(absolute)
      : join(await realpath(dirname(absolute)), basename(absolute))

    if (relativeInside(realRoot, target) === null) return 'outside'

    await saveBytes(target, bytes, current)

    return 'saved'
  } catch (error) {
    return failureOf(error, relativePath)
  }
}

/** Записать байты файла проекта (writeBytes) в учёте идущих записей: выход из IDE их дождётся. */
export const writeProjectBytes = (
  rootPath: string,
  relativePath: string,
  bytes: Buffer,
): Promise<'saved' | 'occupied' | FileFailure> => tracked(writeBytes(rootPath, relativePath, bytes))

/** Дождаться записей, которые ещё идут: перед выходом из IDE. */
export const settleWrites = async (): Promise<void> => {
  await Promise.allSettled([...pending])
}

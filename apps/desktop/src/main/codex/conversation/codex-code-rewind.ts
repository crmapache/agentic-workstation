import { randomBytes } from 'node:crypto'
import { rm, rename, readFile, realpath, writeFile } from 'node:fs/promises'
import { sep, dirname, relative } from 'node:path'

import type { FeedItem, PatchHunk } from '@shared/conversation-feed'
import type { RewindPreview } from '@shared/rewind'
import { REWIND_FILES_LISTED } from '@shared/rewind'

import { hunkCounts } from '../feed/codex-diff'
import { sideOf, reverseHunks } from '../feed/codex-reverse-patch'
import { resolveInsideRoot } from '../../fs/project-paths'

/** Правка файла в ленте: путь (у переноса - новый), откуда перенесён, вид и куски. */
type FileChange = { path: string; movedFrom: string; kind: string; hunks: readonly PatchHunk[] }

/**
 * Что станет с файлом после отката: содержимое (null - файла не будет) и каким он был при
 * сухом прогоне - по нему откат сверяется перед записью и возвращает записанное при сбое.
 */
export type FileRevert = { path: string; content: string | null; before: string | null }

/** Почему код не вернуть: файлы меняли после правок агента или правки шли вне проекта. */
export type RevertRefusal = 'changedSince' | 'outsideProject'

export type CodeRevert =
  | { ok: true; files: FileRevert[]; insertions: number; deletions: number }
  | { ok: false; reason: RevertRefusal }

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Правки файлов с сообщения и после - по порядку ленты: вызовы apply_patch, которые применились. */
export const changesFrom = (items: readonly FeedItem[], messageId: string): FileChange[] => {
  const start = items.findIndex((item) => item.id === messageId)

  return start < 0
    ? []
    : items.slice(start).flatMap((item): FileChange[] => {
        if (item.kind !== 'tool' || item.name !== 'apply_patch' || item.status !== 'done') return []

        const { action } = item
        const movedTo = text(item.input['movePath'])

        return action.kind === 'edit' || action.kind === 'write'
          ? [
              {
                path: action.path,
                movedFrom: movedTo ? text(item.input['path']) : '',
                kind: text(item.input['kind']),
                hunks: action.preview,
              },
            ]
          : []
      })
}

const readOrNull = (path: string): Promise<string | null> =>
  readFile(path, 'utf8').catch(() => null)

/**
 * Путь правки - внутри проекта, и по-настоящему: папка файла после разворота ссылок тоже в
 * корне. null - вне проекта: откат туда не пишет.
 */
const insideProject = async (root: string, path: string): Promise<string | null> => {
  const absolute = resolveInsideRoot(root, path)

  if (!absolute) return null

  const [realRoot, realDir] = await Promise.all([
    realpath(root).catch(() => root),
    realpath(dirname(absolute)).catch(() => dirname(absolute)),
  ])
  const fromRoot = relative(realRoot, realDir)

  return fromRoot === '..' || fromRoot.startsWith(`..${sep}`) ? null : absolute
}

/** Файл после обратной правки; undefined - файл с тех пор меняли, вернуть нельзя. */
const revertedContent = (current: string | null, change: FileChange): string | null | undefined => {
  if (change.kind === 'delete') {
    return current === null
      ? `${change.hunks.flatMap((hunk) => sideOf(hunk, '-')).join('\n')}\n`
      : undefined
  }

  const reversed = current === null ? null : reverseHunks(current, change.hunks)

  if (reversed === null) return undefined
  // Созданный агентом файл уходит, только если в нём нет ничего сверх созданного.
  if (change.kind === 'add') return reversed.trim() === '' ? null : undefined

  return reversed
}

/**
 * Сухой прогон отката кода (копий файлов у Codex нет): правки с последней к первой - обратно,
 * в памяти. Перенесённый файл возвращается на старое место. Хоть один файл после правки
 * меняли или правка шла вне проекта - отказ целиком, ничего не тронуто.
 */
export const planCodeRevert = async (
  changes: readonly FileChange[],
  projectPath: string,
): Promise<CodeRevert> => {
  const state = new Map<string, { content: string | null; before: string | null }>()
  const read = async (path: string) =>
    state.has(path) ? (state.get(path)?.content ?? null) : await readOrNull(path)
  const put = (path: string, content: string | null, before: string | null) =>
    state.set(path, { content, before: state.get(path)?.before ?? before })
  let insertions = 0
  let deletions = 0

  for (const change of changes.toReversed()) {
    const path = await insideProject(projectPath, change.path)
    const from = change.movedFrom ? await insideProject(projectPath, change.movedFrom) : null

    if (!path || (change.movedFrom && !from)) return { ok: false, reason: 'outsideProject' }

    const current = await read(path)
    const next = revertedContent(current, change)

    if (next === undefined) return { ok: false, reason: 'changedSince' }

    if (from) {
      // Перенос назад: на старом месте ничего не должно появиться с тех пор.
      if ((await read(from)) !== null) return { ok: false, reason: 'changedSince' }

      put(from, next, null)
      put(path, null, current)
    } else {
      put(path, next, current)
    }

    const counts = hunkCounts(change.hunks)

    insertions += counts.removed
    deletions += counts.added
  }

  return {
    ok: true,
    files: [...state].map(([path, { content, before }]) => ({ path, content, before })),
    insertions,
    deletions,
  }
}

/** Предпросмотр для диалога отката: что вернётся, или почему код не вернуть. */
export const previewOf = (plan: CodeRevert, projectPath: string): RewindPreview => {
  if (!plan.ok) return { state: plan.reason }
  if (plan.files.length === 0) return { state: 'none' }

  return {
    state: 'ready',
    files: plan.files.slice(0, REWIND_FILES_LISTED).map((file) => relative(projectPath, file.path)),
    count: plan.files.length,
    insertions: plan.insertions,
    deletions: plan.deletions,
  }
}

/** Записать файл целиком: во временный рядом и переименовать - половины файла не бывает. */
const writeWhole = async (path: string, content: string | null): Promise<void> => {
  if (content === null) return rm(path, { force: true })

  const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`

  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

/**
 * Записать откат. Прямо перед записью каждый файл сверяется с тем, что видел сухой прогон: его
 * поменяли за это время (правка человека, автосохранение) - не пишется ничего. Сбой посреди
 * записи - уже записанное возвращается как было. Ответ - причина отказа или null.
 */
export const writeCodeRevert = async (files: readonly FileRevert[]): Promise<string | null> => {
  for (const file of files) {
    if ((await readOrNull(file.path)) !== file.before) return 'changedSince'
  }

  const written: FileRevert[] = []

  try {
    for (const file of files) {
      await writeWhole(file.path, file.content)
      written.push(file)
    }

    return null
  } catch (error) {
    console.warn('[codex] откат кода не записался, записанное возвращается:', error)

    for (const file of written.toReversed()) {
      await writeWhole(file.path, file.before).catch(() => undefined)
    }

    return error instanceof Error ? error.message : String(error)
  }
}

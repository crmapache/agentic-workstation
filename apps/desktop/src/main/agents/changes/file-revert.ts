import { rm, stat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'

import type { ChangeRefusal } from '@shared/claude-feed'

import type { FileEdit } from './change-revert'
import { redoEdits, revertText, bringBackText } from './change-revert'
import { MAX_FILE_BYTES } from './changes.constants'

/** Файл как текст с `\n` и был ли он с концами строк Windows; null - файла нет. */
const readText = async (path: string) => {
  const info = await stat(path).catch(() => null)

  if (!info) return null
  if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('not a text file to edit')

  const raw = await readFile(path, 'utf8')

  return { text: raw.replaceAll('\r\n', '\n'), crlf: raw.includes('\r\n') }
}

const write = async (path: string, text: string, crlf: boolean) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, crlf ? text.replaceAll('\n', '\r\n') : text)
}

/**
 * Снять правки хода с файла на диске (restore - сделать снова). Пишется только
 * отличающийся текст: уже откаченный файл засчитан без записи. Созданный файл, которого
 * уже нет, - уже откачен; при возврате пишется заново вместе с папками. null - вышло.
 */
export const revertOnDisk = async (
  path: string,
  edits: readonly FileEdit[],
  restore: boolean,
): Promise<ChangeRefusal | null> => {
  if (!isAbsolute(path) || edits.length === 0) return 'failed'

  const created = edits[0]?.kind === 'create'

  try {
    const current = await readText(path)

    if (!current) {
      if (!created) return 'missing'
      if (!restore) return null

      const made = redoEdits(null, edits)

      if (made.kind !== 'text') return 'changed'

      await write(path, made.text, false)

      return null
    }

    const result = restore ? bringBackText(current.text, edits) : revertText(current.text, edits)

    if (result.kind === 'changed') return 'changed'
    if (result.kind === 'delete') await rm(path, { force: true })
    if (result.kind === 'text' && result.text !== current.text) {
      await write(path, result.text, current.crlf)
    }

    return null
  } catch (error) {
    console.warn('[claude] файл хода не записался:', path, error)

    return 'failed'
  }
}

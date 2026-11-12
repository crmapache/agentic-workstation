import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { rm, readdir } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'

import { IS_MAC } from '../../platform'
import { KEYCHAIN_NOT_FOUND } from './accounts.constants'

/** Имя записи Keychain хранилища: так её называет CLI (замер ACC). */
export const keychainService = (drawer: string) =>
  `Claude Code-credentials-${createHash('sha256').update(drawer.normalize('NFC')).digest('hex').slice(0, 8)}`

/** Лежит ли путь внутри папки (и не равен ей): удалять можно только своё. */
export const isInside = (dir: string, path: string): boolean => {
  const rest = relative(dir, path)

  return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest)
}

/**
 * Запись Keychain с токеном хранилища - только на маке. На Windows CLI держит вход файлом в
 * папке хранилища, и он уходит вместе с папкой.
 */
const deleteKeychainEntry = (drawer: string) =>
  new Promise<void>((done) => {
    if (!IS_MAC) {
      done()

      return
    }

    execFile('security', ['delete-generic-password', '-s', keychainService(drawer)], (error) => {
      const code = error && typeof error.code === 'number' ? error.code : 0

      if (error && code !== KEYCHAIN_NOT_FOUND) {
        console.warn('[claude] запись Keychain хранилища не удалилась:', code, error.message)
      }

      done()
    })
  })

/**
 * Уничтожить своё хранилище входа: запись Keychain с токеном и папку. Только внутри
 * папки аккаунтов IDE - испорченный реестр не должен удалить чужую папку. Запись
 * Keychain удаляется и тогда, когда папки уже нет: вход мог лечь после отмены.
 */
export const destroyDrawer = async (dir: string, drawer: string): Promise<void> => {
  if (!isInside(dir, drawer)) {
    console.warn('[claude] хранилище вне папки аккаунтов, не трогаю:', drawer)

    return
  }

  await deleteKeychainEntry(drawer)
  await rm(drawer, { recursive: true, force: true })
}

/** Хранилища в папке аккаунтов, которых нет в реестре: брошенные черновики входа. */
export const orphanDrawers = async (dir: string, known: ReadonlySet<string>): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('s-'))
    .map((entry) => join(dir, entry.name))
    .filter((drawer) => !known.has(drawer))
}

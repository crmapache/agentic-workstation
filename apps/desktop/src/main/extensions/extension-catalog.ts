import { stat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ExtensionProblem, ExtensionManifest } from '@shared/extensions'

import { EXTENSION_ID, MANIFEST_FILE, parseManifest } from './manifest/manifest'

/** Папка расширения, найденная в корне: манифест или причина, почему его нет. */
export type FoundExtension = {
  id: string
  dir: string
  manifest: ExtensionManifest | null
  problem: ExtensionProblem | null
}

/** Прочитать одну папку расширения. Нет манифеста - null: это не расширение. */
export const readExtension = async (root: string, id: string): Promise<FoundExtension | null> => {
  const dir = join(root, id)
  const raw = await readFile(join(dir, MANIFEST_FILE), 'utf8').catch(() => null)

  if (raw === null) return null

  const parsed = parseManifest(raw, id)

  return parsed.ok
    ? { id, dir, manifest: parsed.manifest, problem: null }
    : { id, dir, manifest: null, problem: { code: 'manifest', detail: parsed.detail } }
}

/** Все расширения корня по алфавиту id: папки с именем-id и манифестом. */
export const scanExtensions = async (root: string): Promise<FoundExtension[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const folders = entries
    .filter((entry) => entry.isDirectory() && EXTENSION_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const found = await Promise.all(folders.map((id) => readExtension(root, id)))

  return found.filter((item): item is FoundExtension => item !== null)
}

/** Папки, которые в отпечаток не входят: зависимости и служебное. */
const STAMP_SKIPPED = new Set(['node_modules', '.git'])

/**
 * Отпечаток папки расширения: число файлов, их размер и самая поздняя правка. Слежение за
 * папкой перезапускает расширение, только если он сменился: установка из магазина уже
 * перезапустила его сама, и второе событие от той же записи лишнее.
 */
export const folderStamp = async (dir: string): Promise<string> => {
  let files = 0
  let size = 0
  let latest = 0
  const walk = async (folder: string, depth: number) => {
    if (depth > 6 || files > 500) return

    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const path = join(folder, entry.name)

      if (entry.isDirectory()) {
        if (!STAMP_SKIPPED.has(entry.name)) await walk(path, depth + 1)
      } else if (entry.isFile()) {
        const info = await stat(path).catch(() => null)

        if (!info) continue

        files += 1
        size += info.size
        latest = Math.max(latest, info.mtimeMs)
      }
    }
  }

  await walk(dir, 1)

  return `${files}:${size}:${latest}`
}

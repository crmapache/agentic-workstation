import { randomBytes } from 'node:crypto'
import { rm, stat, mkdir, rename, readdir, readFile, writeFile } from 'node:fs/promises'
import { sep, join, dirname, relative } from 'node:path'

import type {
  PackageCheck,
  ExtensionPackage,
} from '@agentic-workstation/store-protocol/package-format'
import {
  checkPackage,
  isPackagePath,
  PACKAGE_FORMAT,
  PACKAGE_LIMITS,
} from '@agentic-workstation/store-protocol/package-format'

import { MANIFEST_FILE } from '../manifest/manifest'

/** Папки, которые в пакет не идут никогда: зависимости и служебное. */
const SKIPPED_DIRS = new Set(['node_modules', '.git'])

/** Все файлы папки расширения, которые годятся в пакет: путь через «/» от корня папки. */
const packedFiles = async (dir: string): Promise<string[]> => {
  const found: string[] = []
  const walk = async (folder: string, depth: number) => {
    if (depth > PACKAGE_LIMITS.depth) return

    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
          await walk(path, depth + 1)
      } else if (entry.isFile()) {
        const name = relative(dir, path).split(sep).join('/')

        if (isPackagePath(name)) found.push(name)
      }

      if (found.length > PACKAGE_LIMITS.files) return
    }
  }

  await walk(dir, 1)

  return found.sort()
}

/**
 * Пакет из папки расширения (ADR 0091): манифест и текстовые файлы, без руководства для ИИ и без
 * скрытого. Проверка - той же, что делает магазин: что не пройдёт там, не уходит и отсюда.
 */
export const packExtension = async (dir: string): Promise<PackageCheck> => {
  let manifest: unknown

  try {
    manifest = JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf8'))
  } catch {
    return { ok: false, reason: 'extension.json is missing or not valid JSON' }
  }

  const files: Record<string, string> = {}

  for (const name of await packedFiles(dir)) {
    if (name === MANIFEST_FILE) continue

    const path = join(dir, ...name.split('/'))

    if ((await stat(path)).size > PACKAGE_LIMITS.totalChars)
      return { ok: false, reason: `${name} is too large` }

    files[name] = await readFile(path, 'utf8')
  }

  return checkPackage({ format: PACKAGE_FORMAT, manifest, files })
}

/**
 * Поставить пакет в папку расширения: файлы - во временную папку рядом, потом подмена целиком.
 * Слежение за корнем увидит новую папку разом, а не полупустую посреди записи. Старая версия
 * уходит после подмены.
 */
export const unpackExtension = async (
  root: string,
  pkg: ExtensionPackage,
  id: string,
): Promise<void> => {
  const stamp = randomBytes(6).toString('hex')
  const staging = join(root, `.installing-${id}-${stamp}`)
  const target = join(root, id)
  const old = join(root, `.replaced-${id}-${stamp}`)

  await mkdir(staging, { recursive: true })

  try {
    await writeFile(join(staging, MANIFEST_FILE), `${JSON.stringify(pkg.manifest, null, 2)}\n`)

    for (const [name, text] of Object.entries(pkg.files)) {
      if (!isPackagePath(name)) continue

      const path = join(staging, ...name.split('/'))

      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text)
    }

    const had = await stat(target).then(
      () => true,
      () => false,
    )

    if (had) await rename(target, old)

    await rename(staging, target)
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(old, { recursive: true, force: true })
  }
}

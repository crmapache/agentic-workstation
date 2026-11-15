import { statSync, readFileSync } from 'node:fs'

import ts from 'typescript'

import { scriptKindOf } from './script-files'

type Entry = { stamp: string; source: ts.SourceFile }

/**
 * Файлы с диска, куда ведут импорты, - разобранными. Сверяются по времени изменения и размеру:
 * поменяли файл - разбирается заново. Держится limit последних, старые уходят первыми.
 */
export class SourceCache {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly limit: number,
    private readonly maxText: number,
  ) {}

  /** Разобранный файл; null - не код, нет такого или слишком большой. */
  get(file: string): ts.SourceFile | null {
    const kind = scriptKindOf(file)
    const stat = kind === null ? null : statSync(file, { throwIfNoEntry: false })

    if (kind === null || !stat?.isFile() || stat.size > this.maxText) return null

    const stamp = `${stat.mtimeMs}:${stat.size}`
    const known = this.entries.get(file)

    this.entries.delete(file)

    if (known?.stamp === stamp) {
      this.entries.set(file, known)

      return known.source
    }

    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      false,
      kind,
    )

    this.entries.set(file, { stamp, source })

    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break

      this.entries.delete(oldest)
    }

    return source
  }
}

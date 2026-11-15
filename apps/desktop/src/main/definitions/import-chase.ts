import { DEFINITION_CHASE_DEPTH } from './definition.constants'
import type { Place, ImportedName } from './definition.types'
import { findExport } from './export-lookup'
import type { ModuleResolver } from './module-resolver'
import type { SourceCache } from './source-cache'

/**
 * Импорт - до места, где имя объявлено: модуль по пути импорта, в нём экспорт с этим именем, а
 * если модуль только передаёт его дальше («export { a } from», «export * from», свой импорт,
 * отданный экспортом) - следующий модуль, пока имя не найдётся. Как в WebStorm: ⌘ по имени из
 * barrel-файла ведёт к самому объявлению, а не к строке реэкспорта.
 */
export class ImportChase {
  constructor(
    private readonly modules: ModuleResolver,
    readonly sources: SourceCache,
  ) {}

  /** Файл, куда ведёт путь импорта; null - не нашёлся. */
  module(from: string, spec: string): string | null {
    return this.modules.resolve(spec, from)
  }

  /**
   * Где объявлено импортированное имя. Модуль нашёлся, а имя в нём нет (CommonJS, сборка без
   * типов) - начало модуля: туда импорт и ведёт. null - модуль не нашёлся, вести некуда.
   */
  find(from: string, via: ImportedName): Place | null {
    return this.follow(from, via, 0, new Set())
  }

  private follow(from: string, via: ImportedName, depth: number, seen: Set<string>): Place | null {
    const file = this.modules.resolve(via.spec, from)

    if (!file) return null
    if (via.name === '*') return { file, pos: 0 }

    return this.exported(file, via.name, depth, seen) ?? { file, pos: 0 }
  }

  private exported(file: string, name: string, depth: number, seen: Set<string>): Place | null {
    const key = `${file}\n${name}`
    const source = this.sources.get(file)

    if (seen.has(key) || depth > DEFINITION_CHASE_DEPTH || !source) return null

    seen.add(key)

    const hit = findExport(source, name)

    if (hit.kind === 'here') return { file, pos: hit.pos }

    if (hit.kind === 'imported') {
      return this.follow(file, hit.via, depth + 1, seen) ?? { file, pos: hit.pos }
    }

    if (hit.kind === 'stars') {
      for (const spec of hit.specs) {
        const next = this.modules.resolve(spec, file)
        const found = next && this.exported(next, name, depth + 1, seen)

        if (found) return found
      }
    }

    return null
  }
}

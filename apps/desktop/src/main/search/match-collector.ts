import type { TextMatch, TextSearchResult } from '@shared/search'

import { toWindowRelative } from '../fs/project-paths'
import { TEXT_MATCHES_LIMIT, TEXT_MATCHES_PER_FILE_LIMIT } from './search.constants'
import { buildPreview } from './text-match'

/**
 * Копилка совпадений с пределами: всего и на файл. Одна на все пути поиска (git grep,
 * чтение по списку git, обход без git), чтобы пределы, превью и вид путей были
 * одинаковыми.
 */
export class MatchCollector {
  private readonly matches: TextMatch[] = []
  private readonly perFile = new Map<string, number>()
  private full = false
  private incomplete = false

  constructor(private readonly query: string) {}

  /**
   * Ещё одна найденная строка. false - общий предел набран, искать дальше незачем.
   * Предел отмечается на первом лишнем совпадении: ровно 500 - это ещё «всё».
   * clipped - text лишь начало огромной строки (см. RecordReader).
   */
  add(path: string, line: number, text: string, clipped = false): boolean {
    if (this.full) return false

    const relativePath = toWindowRelative(path)
    const count = this.perFile.get(relativePath) ?? 0

    if (count >= TEXT_MATCHES_PER_FILE_LIMIT) return true

    if (this.matches.length >= TEXT_MATCHES_LIMIT) {
      this.full = true
      this.incomplete = true

      return false
    }

    this.perFile.set(relativePath, count + 1)
    this.matches.push({ relativePath, line, ...buildPreview(text, this.query, clipped) })

    return true
  }

  /**
   * Поиск прервали или он видел не все файлы (отмена, время, предел файлов) -
   * показано не всё. Добавлять найденное это не мешает.
   */
  markIncomplete(): void {
    this.incomplete = true
  }

  result(): TextSearchResult {
    return { matches: this.matches, truncated: this.incomplete }
  }
}

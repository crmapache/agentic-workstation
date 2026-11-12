import { packContent, unpackContent } from './content-key'
import { keysInGit, readFromGit } from './git-objects'
import type { HistoryStore } from './history-store'

/**
 * Содержимое версий: у истории в базе или в git проекта. Ключ истории - ключ объекта git, и
 * то, что git уже хранит (закоммиченный файл, файл другой ветки), история к себе не копирует:
 * копия была бы вторым экземпляром проекта на каждую смену ветки.
 */
export class HistoryBlobs {
  constructor(
    private readonly store: HistoryStore,
    private readonly now: () => number,
  ) {}

  /**
   * Сохранить новое содержимое, которого нет ни у истории, ни в git проекта: сверка зовёт это
   * сразу по прочитанной пачке файлов, и байты не копятся в памяти на весь проект. budget -
   * сколько байт ещё можно положить (первая сверка); то, что уже лежит, - свежее заново: уборка
   * его не тронет, пока сверка не записала ссылки на него.
   */
  async keep(
    root: string,
    contents: ReadonlyMap<string, Buffer>,
    budget: { left: number } | null = null,
  ): Promise<void> {
    const now = this.now()
    const fresh = [...contents.keys()].filter((key) => {
      const kept = this.store.hasBlob(key)

      if (kept) this.store.touchBlob(key, now)

      return !kept
    })
    const inGit = fresh.length > 0 ? await keysInGit(root, fresh) : new Set<string>()

    for (const key of fresh) {
      const bytes = contents.get(key)

      if (!bytes || inGit.has(key)) continue
      if (budget) {
        if (bytes.length > budget.left) continue

        budget.left -= bytes.length
      }

      this.store.putBlob(key, bytes.length, await packContent(bytes), now)
    }
  }

  /**
   * Какие из ключей ещё можно достать - у истории или в git. Прочие события запишут как
   * «неизвестно, что было».
   */
  async available(root: string, keys: ReadonlySet<string>): Promise<Set<string>> {
    const own = new Set([...keys].filter((key) => this.store.hasBlob(key)))
    const rest = [...keys].filter((key) => !own.has(key))
    const inGit = rest.length > 0 ? await keysInGit(root, rest) : new Set<string>()

    return new Set([...own, ...inGit])
  }

  /** Содержимое версии: у истории или в git проекта; нет нигде (или не распаковалось) - null. */
  async read(root: string, key: string): Promise<Buffer | null> {
    const own = this.store.blob(key)

    if (own) {
      return unpackContent(own.packed).catch((error: unknown) => {
        console.warn('[history] версия не распаковалась:', key, error)

        return null
      })
    }

    return (await readFromGit(root, [key])).get(key) ?? null
  }
}

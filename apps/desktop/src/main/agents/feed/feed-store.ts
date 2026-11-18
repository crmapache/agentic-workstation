import type { FeedItem } from '@shared/claude-feed'

/**
 * Элементы ленты по порядку и по id, плюс список тронутых с прошлого сбора. Лента
 * растёт только вниз; меняется элемент на месте (текст дописывается, у вызова
 * появляется результат), поэтому окну уходят только тронутые.
 */
export class FeedStore {
  private readonly list: FeedItem[] = []
  private readonly positions = new Map<string, number>()
  private readonly touched = new Set<string>()
  private readonly removed = new Set<string>()

  get items(): readonly FeedItem[] {
    return this.list
  }

  get(id: string): FeedItem | undefined {
    const position = this.positions.get(id)

    return position === undefined ? undefined : this.list[position]
  }

  /** Новый элемент встаёт в конец, существующий заменяется на месте. */
  put(item: FeedItem): void {
    const position = this.positions.get(item.id)

    if (position === undefined) {
      this.positions.set(item.id, this.list.length)
      this.list.push(item)
    } else {
      this.list[position] = item
    }

    this.touched.add(item.id)
  }

  /** Поменять существующий элемент. Нет такого или другой вид - ничего не делает. */
  update<Kind extends FeedItem['kind']>(
    id: string,
    kind: Kind,
    change: (item: Extract<FeedItem, { kind: Kind }>) => Extract<FeedItem, { kind: Kind }>,
  ): void {
    const item = this.get(id)

    if (item?.kind === kind) this.put(change(item as Extract<FeedItem, { kind: Kind }>))
  }

  /**
   * Убрать элемент и всё, что после него (откат разговора), кроме keep - те встают
   * в конец по порядку. Нет такого - ничего не делает. Убранные уходят окну отдельным
   * списком (drainRemoved).
   */
  removeFrom(id: string, keep: ReadonlySet<string> = new Set()): void {
    const position = this.positions.get(id)

    if (position === undefined) return

    for (const item of this.list.splice(position)) {
      if (keep.has(item.id)) {
        this.positions.set(item.id, this.list.length)
        this.list.push(item)
        continue
      }

      this.positions.delete(item.id)
      this.touched.delete(item.id)
      this.removed.add(item.id)
    }
  }

  /**
   * Убрать один элемент (карточку, которой больше нечего сказать: компакт, где нечего
   * было сжимать, мгновенно прошедший повтор). Остальные встают на его место по порядку.
   */
  removeOne(id: string): void {
    const position = this.positions.get(id)

    if (position === undefined) return

    this.list.splice(position, 1)
    this.positions.delete(id)
    this.touched.delete(id)
    this.removed.add(id)

    for (const [index, item] of this.list.entries()) {
      if (index >= position) this.positions.set(item.id, index)
    }
  }

  /**
   * Поставить элементы перед всеми (страница ранней истории). Те, что уже есть, не
   * трогаются. Окну они уходят новой лентой целиком, а не патчем.
   */
  prepend(items: readonly FeedItem[]): void {
    const fresh = items.filter((item) => !this.positions.has(item.id))

    this.list.unshift(...fresh)

    for (const [index, item] of this.list.entries()) this.positions.set(item.id, index)
  }

  /** Убранные с прошлого вызова. */
  drainRemoved(): string[] {
    const ids = [...this.removed]

    this.removed.clear()

    return ids
  }

  /** Элементы, тронутые с прошлого вызова, в порядке ленты. */
  drainTouched(): FeedItem[] {
    const ids = [...this.touched]

    this.touched.clear()

    return ids
      .map((id) => this.positions.get(id))
      .filter((position): position is number => position !== undefined)
      .sort((left, right) => left - right)
      .map((position) => this.list[position])
      .filter((item): item is FeedItem => item !== undefined)
  }

  clear(): void {
    this.list.length = 0
    this.positions.clear()
    this.touched.clear()
    this.removed.clear()
  }
}

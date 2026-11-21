import { byRank } from './tracker-rank'
import type { RecordKind, TrackerRecord } from './tracker-records'
import { refOf, textOf, isAlive } from './tracker-records'

/**
 * Дерево доски поверх записей: кто чей ребёнок и в каком пространстве запись. Родитель - поле
 * записи (проект → space, поток → project, группа → flow, задача → group, продолжение →
 * parent), поэтому перенос - правка одного поля, а дерево строится заново на каждый взгляд.
 */

/** Поле-родитель записи каждого вида. */
const PARENT_FIELD: Record<Exclude<RecordKind, 'space'>, string> = {
  project: 'space',
  flow: 'project',
  group: 'flow',
  card: 'group',
}

/** Насколько глубоко ищется задача продолжения: цепочку из гонок правок не дать зациклить. */
const MAX_DEPTH = 8

export type Ranked = { id: string; rank: string; record: TrackerRecord }

const rankedOf = (record: TrackerRecord): Ranked => ({
  id: record.id,
  rank: textOf(record, 'rank'),
  record,
})

export class TrackerTree {
  private readonly byId = new Map<string, TrackerRecord>()
  private readonly kids = new Map<string, TrackerRecord[]>()
  /** Задачи по группам и цепочки по задачам - один проход на дерево, а не на каждый вопрос. */
  private cached: {
    tasks: Map<string, TrackerRecord[]>
    chains: Map<string, TrackerRecord[]>
  } | null = null

  constructor(records: Iterable<TrackerRecord>) {
    for (const record of records) {
      this.byId.set(record.id, record)

      const parent = this.parentOf(record)

      if (parent) this.kids.set(parent, [...(this.kids.get(parent) ?? []), record])
    }
  }

  get(id: string): TrackerRecord | undefined {
    return this.byId.get(id)
  }

  /** Живая запись нужного вида или undefined. */
  alive(id: string, kind: RecordKind): TrackerRecord | undefined {
    const record = this.byId.get(id)

    return isAlive(record) && record.kind === kind ? record : undefined
  }

  /** Все записи вида (и удалённые): для пространств и проверок. */
  all(kind: RecordKind): TrackerRecord[] {
    return [...this.byId.values()].filter((record) => record.kind === kind)
  }

  /** Живые дети нужного вида по месту. Продолжения задачи - дети вида card по полю parent. */
  children(parentId: string, kind: RecordKind): Ranked[] {
    return (this.kids.get(parentId) ?? [])
      .filter((record) => isAlive(record) && record.kind === kind)
      .map(rankedOf)
      .sort(byRank)
  }

  /**
   * Задачи группы: карточки этой группы, которые сами себе задача (rootOf). Задача, ставшая
   * корнем после разрыва цикла, - тоже здесь, хотя поле parent у неё не пустое.
   */
  tasks(groupId: string): Ranked[] {
    return (this.cards().tasks.get(groupId) ?? []).map(rankedOf).sort(byRank)
  }

  /**
   * Продолжения задачи слева направо: все живые карточки, чей корень - эта задача. Продолжение
   * продолжения (встречные переносы двух машин) встаёт в ту же цепочку, а не пропадает.
   */
  followUps(taskId: string): Ranked[] {
    return (this.cards().chains.get(taskId) ?? []).map(rankedOf).sort(byRank)
  }

  /** Живые карточки по корню: задачи - в свою группу, остальные - в цепочку своей задачи. */
  private cards() {
    if (this.cached) return this.cached

    const tasks = new Map<string, TrackerRecord[]>()
    const chains = new Map<string, TrackerRecord[]>()

    for (const record of this.byId.values()) {
      if (record.kind !== 'card' || !isAlive(record)) continue

      const root = this.rootOf(record.id)

      if (!root) continue

      const [map, key] = root.id === record.id ? [tasks, refOf(record, 'group')] : [chains, root.id]

      if (key) map.set(key, [...(map.get(key) ?? []), record])
    }

    this.cached = { tasks, chains }

    return this.cached
  }

  /**
   * Задача, к цепочке которой относится карточка: сама карточка, если она задача. Цикл (две
   * машины перенесли задачи друг к другу) рвётся одинаково везде: корень - карточка цикла с
   * меньшим id. null - цепочка оборвана (родителя нет) или слишком длинна.
   */
  rootOf(cardId: string): TrackerRecord | null {
    const seen: TrackerRecord[] = []
    let current = this.byId.get(cardId)

    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
      if (seen.includes(current)) {
        const cycle = seen.slice(seen.indexOf(current))

        return cycle.reduce((least, one) => (one.id < least.id ? one : least))
      }

      seen.push(current)

      const parent = refOf(current, 'parent')

      if (!parent) return current

      current = this.byId.get(parent)
    }

    return null
  }

  /** Пространство записи по цепочке родителей (и у удалённой записи тоже). */
  spaceOf(id: string): string | null {
    let current = this.byId.get(id)

    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
      if (current.kind === 'space') return current.id

      const parent = this.parentOf(current)

      if (!parent) return null

      current = this.byId.get(parent)
    }

    return null
  }

  /** Ближайший предок нужного вида (и у удалённой записи тоже). */
  ancestor(id: string, kind: RecordKind): TrackerRecord | null {
    let current = this.byId.get(id)

    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
      if (current.kind === kind) return current

      const parent = this.parentOf(current)

      current = parent ? this.byId.get(parent) : undefined
    }

    return null
  }

  /** Предки записи снизу вверх до пространства (и удалённые тоже). */
  ancestors(id: string): TrackerRecord[] {
    const out: TrackerRecord[] = []
    let current = this.byId.get(id)

    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
      const parent = this.parentOf(current)
      const next = parent ? this.byId.get(parent) : undefined

      if (!next || out.includes(next)) break

      out.push(next)
      current = next
    }

    return out
  }

  /** Все живые потомки записи (для удаления каскадом). */
  descendants(id: string): string[] {
    const out: string[] = []
    const walk = (parentId: string, depth: number) => {
      if (depth > MAX_DEPTH) return

      for (const child of this.kids.get(parentId) ?? []) {
        if (!isAlive(child)) continue

        out.push(child.id)
        walk(child.id, depth + 1)
      }
    }

    walk(id, 0)

    return out
  }

  private parentOf(record: TrackerRecord): string | null {
    if (record.kind === 'space') return null
    if (record.kind === 'card') return refOf(record, 'parent') ?? refOf(record, 'group')

    return refOf(record, PARENT_FIELD[record.kind])
  }
}

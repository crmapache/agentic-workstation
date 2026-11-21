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

  /** Задачи группы - карточки без задачи-родителя. */
  tasks(groupId: string): Ranked[] {
    return this.children(groupId, 'card').filter((card) => !refOf(card.record, 'parent'))
  }

  /** Продолжения задачи слева направо. */
  followUps(taskId: string): Ranked[] {
    return this.children(taskId, 'card')
  }

  /**
   * Задача, к цепочке которой относится карточка: сама карточка, если она задача. null - цепочка
   * оборвана (задачу удалили на другом компьютере) или зациклена.
   */
  rootOf(cardId: string): TrackerRecord | null {
    let current = this.byId.get(cardId)

    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
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

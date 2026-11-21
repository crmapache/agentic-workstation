import { randomUUID } from 'node:crypto'

import type { TrackerSendCode } from '@shared/tracker'

import type { JsonFile } from '../storage/json-file'
import { runsOf, isObject, entriesOf, stringsOf, autoRunsOf } from './tracker-book-parse'
import { NODE_ID, newNodeId, TrackerClock } from './tracker-clock'
import type { RecordKind, RecordField, TrackerRecord } from './tracker-records'
import { stampsOf, sameFields, decodeRecord, encodeRecord, mergeRecords } from './tracker-records'

/**
 * Карточка, отправленная в очередь сценариев на этом компьютере. settled - итог уже учтён; due -
 * срок карточки при отправке (dueKey): повторяющуюся, которую за время прогона отметили руками,
 * сделанный прогон второй раз не сдвигает.
 */
export type RunLink = {
  queueId: string
  itemId: string
  sentAt: number
  settled: boolean
  due: string | null
}

/**
 * Запуск карточки в срок на этом компьютере (ADR 0103): в какой папке проекта, на какой срок
 * карточка уже ушла (firedFor - срок словами, «2026-11-21 09:30») и почему отказала отправка.
 */
export type AutoRunLink = {
  projectPath: string
  firedFor: string | null
  failure: TrackerSendCode | null
}

export type StoredEntry = {
  k: RecordKind
  f: Record<string, RecordField>
  rev: number
  dirty: boolean
}

/**
 * Файл трекера в userData: записи с версией облака и отметкой «не отправлено», курсор забора,
 * метка компьютера для часов. Привязки проектов IDE, прогоны карточек и запуск в срок - только
 * этого компьютера: пути и очереди на другом свои.
 */
export type StoredTracker = {
  version: 1
  node: string
  /** Аккаунт облака, к которому относятся версии и курсор: другой ключ - всё заново. */
  account: string | null
  cursor: number
  records: Record<string, StoredEntry>
  bindings: Record<string, string>
  runs: Record<string, RunLink>
  autoRuns: Record<string, AutoRunLink>
}

type Entry = { record: TrackerRecord; rev: number; dirty: boolean }

/** Запись для облака: что отправить и на какую версию сервера она опирается. */
export type OutgoingRecord = { id: string; baseRev: number; text: string }

/** Чья перемена: своя правка (её надо отправить) или пришедшая из облака. */
export type BookChange = 'local' | 'remote'

const SAVE_DELAY_MS = 300

/**
 * Записи трекера в памяти и на диске. Своя правка ставит полю отметку часов и метку «не
 * отправлено»; запись из облака сливается по полю (tracker-records.ts). Каждая перемена зовёт
 * слушателей: сервис перерисовывает доски, синхронизация отправляет своё.
 */
export class TrackerBook {
  readonly clock: TrackerClock
  private saving: ReturnType<typeof setTimeout> | null = null
  private writing: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<(change: BookChange) => void>()

  private constructor(
    private readonly file: JsonFile<StoredTracker>,
    private readonly node: string,
    private readonly entries: Map<string, Entry>,
    private state: Omit<StoredTracker, 'version' | 'node' | 'records'>,
    now: () => number,
  ) {
    this.clock = new TrackerClock(node, now)

    for (const entry of entries.values()) {
      for (const stamp of stampsOf(entry.record)) this.clock.observe(stamp)
    }
  }

  static async load(file: JsonFile<StoredTracker>, now: () => number = Date.now) {
    const raw = await file.read()
    const stored = isObject(raw) ? raw : {}
    const node =
      typeof stored.node === 'string' && NODE_ID.test(stored.node) ? stored.node : newNodeId()
    const book = new TrackerBook(
      file,
      node,
      entriesOf(stored.records),
      {
        account: typeof stored.account === 'string' ? stored.account : null,
        cursor: typeof stored.cursor === 'number' && stored.cursor >= 0 ? stored.cursor : 0,
        bindings: stringsOf(stored.bindings),
        runs: runsOf(stored.runs),
        autoRuns: autoRunsOf(stored.autoRuns),
      },
      now,
    )

    if (stored.node !== node) book.save()

    return book
  }

  /** Подписка на перемены; возвращает отписку. */
  onChange(listener: (change: BookChange) => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  records(): TrackerRecord[] {
    return [...this.entries.values()].map((entry) => entry.record)
  }

  get(id: string): TrackerRecord | undefined {
    return this.entries.get(id)?.record
  }

  /** Новая запись; возвращает её id. */
  create(kind: RecordKind, values: Record<string, unknown>): string {
    const id = randomUUID()

    this.entries.set(id, { record: { id, kind, fields: {} }, rev: 0, dirty: true })
    this.write(id, values)

    return id
  }

  /**
   * Правка полей записи. Поле с тем же значением не получает новой отметки: иначе пустая правка
   * перебила бы настоящую правку другого компьютера. Возвращает, поменялось ли что-то.
   */
  write(id: string, values: Record<string, unknown>, silent = false): boolean {
    const entry = this.entries.get(id)

    if (!entry) return false

    let changed = false

    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue

      const current = entry.record.fields[name]

      if (current && JSON.stringify(current[0]) === JSON.stringify(value)) continue

      entry.record.fields[name] = [value, this.clock.tick()]
      changed = true
    }

    if (changed) {
      entry.dirty = true
      if (!silent) this.changed('local')
    }

    return changed
  }

  /** Сообщить о пачке тихих правок разом: одна перерисовка вместо десятка. */
  commit() {
    this.changed('local')
  }

  // --- облако -------------------------------------------------------------------------------

  get account(): string | null {
    return this.state.account
  }

  get cursor(): number {
    return this.state.cursor
  }

  set cursor(value: number) {
    this.state.cursor = value
    this.save()
  }

  /** Сколько своих правок ещё не в облаке. */
  get pending(): number {
    return [...this.entries.values()].filter((entry) => entry.dirty).length
  }

  outgoing(): OutgoingRecord[] {
    return [...this.entries.values()]
      .filter((entry) => entry.dirty)
      .map((entry) => ({
        id: entry.record.id,
        baseRev: entry.rev,
        text: encodeRecord(entry.record),
      }))
  }

  /** Облако приняло запись: новая версия; если пока шёл запрос записи не правили - отправлена. */
  acknowledge(id: string, rev: number, text: string) {
    const entry = this.entries.get(id)

    if (!entry) return

    entry.rev = rev
    if (encodeRecord(entry.record) === text) entry.dirty = false
    this.save()
  }

  /** Записи из облака: слить со своими; если своё новее - запись снова к отправке. */
  absorb(pulled: { id: string; rev: number; text: string }[]) {
    let changed = false

    for (const item of pulled) {
      const remote = decodeRecord(item.id, item.text)

      if (!remote) continue

      for (const stamp of stampsOf(remote)) this.clock.observe(stamp)

      const entry = this.entries.get(item.id)
      const merged = entry ? mergeRecords(entry.record, remote) : remote
      const same = sameFields(merged, remote)

      if (entry && sameFields(entry.record, merged) && entry.rev === item.rev && !entry.dirty)
        continue

      this.entries.set(item.id, { record: merged, rev: item.rev, dirty: !same })
      changed = true
    }

    if (changed) this.changed('remote')
    else this.save()
  }

  /** Облако спорит о версии, которую эта машина уже видела: записать поверх неё. */
  rebase(id: string, rev: number) {
    const entry = this.entries.get(id)

    if (!entry) return

    entry.rev = rev
    this.save()
  }

  /**
   * Всё своё - к отправке заново, забор - с начала: другой аккаунт или облако, откатившееся
   * назад (поднятое из бэкапа), - иначе записи, которых там больше нет, туда не вернутся.
   */
  restart() {
    for (const entry of this.entries.values()) {
      entry.rev = 0
      entry.dirty = true
    }

    this.state.cursor = 0
    this.changed('local')
  }

  /** Другой аккаунт: всё своё уйдёт в него заново, забор - с начала. */
  switchAccount(account: string) {
    this.state.account = account
    this.restart()
  }

  // --- только этот компьютер ----------------------------------------------------------------

  binding(projectPath: string): string | null {
    return this.state.bindings[projectPath] ?? null
  }

  bind(projectPath: string, spaceId: string) {
    this.state.bindings[projectPath] = spaceId
    this.save()
  }

  bindings(): Record<string, string> {
    return { ...this.state.bindings }
  }

  runs(): Record<string, RunLink> {
    return { ...this.state.runs }
  }

  setRun(cardId: string, link: RunLink | null) {
    if (link) this.state.runs[cardId] = link
    else delete this.state.runs[cardId]

    this.changed('remote')
  }

  autoRuns(): Record<string, AutoRunLink> {
    return { ...this.state.autoRuns }
  }

  /**
   * Запуск в срок: включить, отметить срок и отказ или выключить (null). Только на диск -
   * перерисовку зовёт тот, кто менял.
   */
  setAutoRun(cardId: string, link: AutoRunLink | null) {
    if (link) this.state.autoRuns[cardId] = link
    else delete this.state.autoRuns[cardId]

    this.save()
  }

  /** Записать на диск сейчас (выход из IDE). */
  async flush() {
    if (this.saving) {
      clearTimeout(this.saving)
      this.saving = null
      this.persist()
    }

    await this.writing
  }

  private changed(change: BookChange) {
    this.save()

    for (const listener of this.listeners) listener(change)
  }

  private save() {
    if (this.saving) return

    this.saving = setTimeout(() => {
      this.saving = null
      this.persist()
    }, SAVE_DELAY_MS)
  }

  private persist() {
    const records: Record<string, StoredEntry> = {}

    for (const [id, entry] of this.entries) {
      records[id] = {
        k: entry.record.kind,
        f: entry.record.fields,
        rev: entry.rev,
        dirty: entry.dirty,
      }
    }

    const snapshot: StoredTracker = { version: 1, node: this.node, ...this.state, records }

    this.writing = this.writing
      .then(() => this.file.write(snapshot))
      .catch((error: unknown) => console.warn('[tracker] запись не удалась', error))
  }
}

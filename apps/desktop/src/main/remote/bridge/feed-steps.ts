import type { FeedItemWire, FeedStepsWire } from '@agentic-workstation/remote-protocol/wire-types'

import { parentOf } from './feed-window'

/** Заплатка для телефона: строки - вставками, шаги субагентов - новым счётом своих вызовов. */
export type SteppedPatch<T extends FeedItemWire> = { rows: T[]; steps: FeedStepsWire }

/**
 * Чей шаг какой - память одного разговора для живых заплаток (feed-window.ts - почему шаги не
 * идут элементами). Снимок видит ленту целиком и считает сам, а заплатка несёт только тронутое:
 * чтобы решить, шаг это (вызов есть в ленте IDE) или строка, и сколько теперь шагов у вызова,
 * надо помнить, что в ленте есть и чей шаг какой. Начало памяти - лента целиком на снимке,
 * дальше - заплатки. Повторный снимок ничего не прибавит: шаг считается один раз, по id.
 */
export class StepLedger {
  /** id всего, что есть в ленте IDE: вызов шага должен быть среди них. */
  private readonly known = new Set<string>()
  private readonly callOf = new Map<string, string>()
  private readonly counts = new Map<string, number>()
  private isSeeded = false

  /**
   * Лента целиком уже прочитана. До этого заплатку не разобрать: шаг вызова, о котором память
   * ещё не знает, ушёл бы телефону строкой.
   */
  get seeded(): boolean {
    return this.isSeeded
  }

  /** Лента целиком (на снимке); не прочиталась - пусто: дальше память живёт заплатками. */
  seed(items: readonly FeedItemWire[]): void {
    for (const item of items) this.known.add(item.id)
    for (const item of items) this.adopt(item, null)
    this.isSeeded = true
  }

  /**
   * Сложенная заплатка, снятое раньше вставок (как applyFeedPatch): снятый шаг уменьшает счёт
   * своего вызова, вставка-шаг на провод не идёт, а прибавляет к счёту - один раз за id. В steps -
   * число целиком у каждого вызова, чей счёт поменялся.
   */
  apply<T extends FeedItemWire>(upserts: readonly T[], removes: Iterable<string>): SteppedPatch<T> {
    const touched = new Set<string>()

    for (const id of removes) this.forget(id, touched)
    // Вызов и его первый шаг бывают в одной заплатке: сначала все id, потом - кто чей шаг.
    for (const item of upserts) this.known.add(item.id)

    const rows = upserts.filter((item) => !this.adopt(item, touched))
    const steps = Object.fromEntries([...touched].map((call) => [call, this.counts.get(call) ?? 0]))

    return { rows, steps }
  }

  /** Шаг, чей вызов в ленте, - на счёт вызова; true - это шаг, строкой он не идёт. */
  private adopt(item: FeedItemWire, touched: Set<string> | null): boolean {
    const counted = this.callOf.get(item.id)

    if (counted !== undefined && this.known.has(counted)) return true

    const call = parentOf(item)

    if (call === null || !this.known.has(call)) {
      this.callOf.delete(item.id)

      return false
    }

    this.callOf.set(item.id, call)
    this.counts.set(call, (this.counts.get(call) ?? 0) + 1)
    touched?.add(call)

    return true
  }

  private forget(id: string, touched: Set<string>) {
    const call = this.callOf.get(id)

    this.known.delete(id)
    // Снят сам вызов (откат) - его счёт уже никому не нужен.
    this.counts.delete(id)

    if (call === undefined) return

    this.callOf.delete(id)

    const count = this.counts.get(call)

    if (count === undefined) return

    this.counts.set(call, Math.max(0, count - 1))
    touched.add(call)
  }
}

import { utf8Length } from '@agentic-workstation/remote-protocol/body'
import { isCommandName, MAY_ARRIVE_IN_PARTS } from '@agentic-workstation/remote-protocol/commands'
import {
  MAX_PARTS,
  MAX_IN_FLIGHT,
  PARTS_PATIENCE_MS,
  MAX_ASSEMBLED_BYTES,
} from '@agentic-workstation/remote-protocol/parts'
import type { PartMessage } from '@agentic-workstation/remote-protocol/phone-messages'

export type PartOutcome =
  { kind: 'waiting' } | { kind: 'whole'; text: string } | { kind: 'refused'; why: string }

/**
 * Что вышло из куска и что пропало заодно: id сообщений, чьи сборки ушли без итога (не дождались
 * частей, вытеснены следующей). Телефону о каждом - слово, а не тишина.
 */
export type PartsTaken = { outcome: PartOutcome; dropped: string[] }

type Assembly = {
  id: string
  count: number
  startedAt: number
  slices: (string | null)[]
  arrived: number
  bytes: number
}

/**
 * Сообщение тяжелее кадра (почти всегда фото с телефона) приходит кусками своего же текста;
 * здесь они склеиваются и идут в ту же дверь, что и целое сообщение. Вес собранного - в байтах
 * UTF-8, тем же числом, что считает телефон (MAX_ASSEMBLED_BYTES).
 */
export class RemoteParts {
  private readonly building = new Map<string, Assembly>()

  constructor(private readonly clock: () => number = Date.now) {}

  take(deviceId: string, part: PartMessage): PartsTaken {
    const now = this.clock()
    const dropped: string[] = []

    for (const [key, assembly] of this.building) {
      if (key.startsWith(`${deviceId}\0`) && now - assembly.startedAt > PARTS_PATIENCE_MS) {
        this.building.delete(key)
        dropped.push(assembly.id)
      }
    }

    return { outcome: this.place(deviceId, part, now, dropped), dropped }
  }

  forget(deviceId: string): void {
    for (const key of this.building.keys())
      if (key.startsWith(`${deviceId}\0`)) this.building.delete(key)
  }

  private place(deviceId: string, part: PartMessage, now: number, dropped: string[]): PartOutcome {
    if (part.n > MAX_PARTS) return { kind: 'refused', why: 'a message claiming too many parts' }
    if (part.i >= part.n) return { kind: 'refused', why: 'a part out of range' }

    const key = `${deviceId}\0${part.id}`
    const assembly = this.building.get(key) ?? this.begin(deviceId, key, part, now, dropped)

    if (assembly.count !== part.n) {
      this.building.delete(key)

      return { kind: 'refused', why: 'parts of one message disagree on how many there are' }
    }

    if (assembly.slices[part.i] !== null) return { kind: 'waiting' }

    assembly.bytes += utf8Length(part.d)

    if (assembly.bytes > MAX_ASSEMBLED_BYTES) {
      this.building.delete(key)

      return { kind: 'refused', why: 'a message over the size limit' }
    }

    assembly.slices[part.i] = part.d
    assembly.arrived += 1

    if (assembly.arrived < part.n) return { kind: 'waiting' }

    this.building.delete(key)

    return { kind: 'whole', text: assembly.slices.join('') }
  }

  /** Новая сборка; третья разом вытесняет самую старую телефона - и та попадает в dropped. */
  private begin(
    deviceId: string,
    key: string,
    part: PartMessage,
    now: number,
    dropped: string[],
  ): Assembly {
    const mine = [...this.building].filter(([entry]) => entry.startsWith(`${deviceId}\0`))
    const [oldestKey, oldest] = mine[0] ?? []

    if (mine.length >= MAX_IN_FLIGHT && oldestKey && oldest) {
      this.building.delete(oldestKey)
      dropped.push(oldest.id)
    }

    const assembly: Assembly = {
      id: part.id,
      count: part.n,
      startedAt: now,
      slices: Array<string | null>(part.n).fill(null),
      arrived: 0,
      bytes: 0,
    }

    this.building.set(key, assembly)

    return assembly
  }
}

/** Собранное из частей - команда, которой можно прийти частями (сообщение с фото), и ничто другое. */
export const mayArriveInParts = (whole: Record<string, unknown>): boolean =>
  whole['k'] === 'cmd' && isCommandName(whole['name']) && MAY_ARRIVE_IN_PARTS.has(whole['name'])

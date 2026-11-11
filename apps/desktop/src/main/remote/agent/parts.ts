import { isCommandName, MAY_ARRIVE_IN_PARTS } from '@agentic-workstation/remote-protocol/commands'
import {
  MAX_PARTS,
  MAX_IN_FLIGHT,
  PARTS_PATIENCE_MS,
  MAX_ASSEMBLED_CHARS,
} from '@agentic-workstation/remote-protocol/parts'
import type { PartMessage } from '@agentic-workstation/remote-protocol/phone-messages'

export type PartOutcome =
  { kind: 'waiting' } | { kind: 'whole'; text: string } | { kind: 'refused'; why: string }

type Assembly = {
  count: number
  startedAt: number
  slices: (string | null)[]
  arrived: number
  chars: number
}

/**
 * Сообщение тяжелее кадра (почти всегда фото с телефона) приходит кусками своего же текста;
 * здесь они склеиваются и идут в ту же дверь, что и целое сообщение.
 */
export class RemoteParts {
  private readonly building = new Map<string, Assembly>()

  constructor(private readonly clock: () => number = Date.now) {}

  take(deviceId: string, part: PartMessage): PartOutcome {
    const now = this.clock()

    for (const [key, assembly] of this.building) {
      if (now - assembly.startedAt > PARTS_PATIENCE_MS) this.building.delete(key)
    }

    if (part.n > MAX_PARTS) return { kind: 'refused', why: 'a message claiming too many parts' }
    if (part.i >= part.n) return { kind: 'refused', why: 'a part out of range' }

    const key = `${deviceId}\0${part.id}`
    const assembly = this.building.get(key) ?? this.begin(deviceId, key, part.n, now)

    if (assembly.count !== part.n) {
      this.building.delete(key)

      return { kind: 'refused', why: 'parts of one message disagree on how many there are' }
    }

    if (assembly.slices[part.i] !== null) return { kind: 'waiting' }

    assembly.chars += part.d.length

    if (assembly.chars > MAX_ASSEMBLED_CHARS) {
      this.building.delete(key)

      return { kind: 'refused', why: 'a message over the size limit' }
    }

    assembly.slices[part.i] = part.d
    assembly.arrived += 1

    if (assembly.arrived < part.n) return { kind: 'waiting' }

    this.building.delete(key)

    return { kind: 'whole', text: assembly.slices.join('') }
  }

  forget(deviceId: string): void {
    for (const key of this.building.keys())
      if (key.startsWith(`${deviceId}\0`)) this.building.delete(key)
  }

  private begin(deviceId: string, key: string, count: number, now: number): Assembly {
    const mine = [...this.building.keys()].filter((entry) => entry.startsWith(`${deviceId}\0`))

    if (mine.length >= MAX_IN_FLIGHT && mine[0]) this.building.delete(mine[0])

    const assembly: Assembly = {
      count,
      startedAt: now,
      slices: Array<string | null>(count).fill(null),
      arrived: 0,
      chars: 0,
    }

    this.building.set(key, assembly)

    return assembly
  }
}

/** Собранное из частей - команда, которой можно прийти частями (сообщение с фото), и ничто другое. */
export const mayArriveInParts = (whole: Record<string, unknown>): boolean =>
  whole['k'] === 'cmd' && isCommandName(whole['name']) && MAY_ARRIVE_IN_PARTS.has(whole['name'])

import { controlFrame } from './frame.ts'

/**
 * Что держится для стороны, которой сейчас нет на линии. Коротко намеренно: у IDE свой
 * журнал, и телефон догоняет по номеру, так что ящик лишь переносит мигание - лифт, тоннель,
 * крышку ноутбука, а не ночь. Ничего не пишется на диск: перезапуск релея опустошает ящики,
 * обе стороны переподключаются и догоняют из журнала IDE.
 *
 * Переполненный или протухший ящик не отдаёт хвост с дырой, которую никто не заметит: ящик
 * уходит целиком, а адресат при возвращении получает одно слово релея (CONTROL) -
 * «переспроси». Спросить дёшево, у IDE есть всё.
 */

export type MailboxLimits = {
  ttlMs: number
  maxFrames: number
  maxBytes: number
  /** Все ящики вместе. */
  totalBytes: number
}

type Held = { frame: Buffer; at: number }

type Box = { frames: Held[]; bytes: number; from: Buffer }

/** Заметка «пропустил»: от кого и когда. Копия 16 байт, а не окно в кадр. */
type Broken = { from: Buffer; at: number }

/** Сколько живёт заметка - кратно жизни кадров: ушедший дольше и так ничего не найдёт. */
const BROKEN_TTL_FACTOR = 10

/** И сколько заметок разом: кадры в никуда оставляют заметки, за которыми никто не придёт. */
const MAX_BROKEN = 50_000

export class Mailboxes {
  private readonly boxes = new Map<string, Box>()
  private readonly broken = new Map<string, Broken>()
  private readonly limits: MailboxLimits
  private total = 0

  constructor(limits: MailboxLimits) {
    this.limits = limits
  }

  /** Подержать кадр для адресата. Не влезает - ящик в заметку «переспроси». */
  hold(address: string, from: Buffer, frame: Buffer, now: number): void {
    const box = this.boxes.get(address) ?? { frames: [], bytes: 0, from: Buffer.from(from) }

    box.frames.push({ frame, at: now })
    box.bytes += frame.length
    this.total += frame.length

    const over =
      box.frames.length > this.limits.maxFrames ||
      box.bytes > this.limits.maxBytes ||
      this.total > this.limits.totalBytes

    if (over) {
      this.drop(address, box)
      this.note(address, from, now)

      return
    }

    this.boxes.set(address, box)
  }

  /** Всё для адреса, старое первым, и ящик пуст. Пропало что-то - первым слово «переспроси». */
  take(address: string, now: number): Buffer[] {
    const parted = this.broken.get(address)
    const box = this.boxes.get(address)

    this.broken.delete(address)
    if (box) this.drop(address, box)

    const fresh = (box?.frames ?? []).filter((held) => now - held.at <= this.limits.ttlMs)
    const expired = fresh.length < (box?.frames.length ?? 0)
    const frames = fresh.map((held) => held.frame)
    const from = parted?.from ?? (expired ? box?.from : undefined)

    if (from) frames.unshift(controlFrame(Buffer.from(address, 'base64url'), from))

    return frames
  }

  /** Старое, за которым не вернулись. Зовётся по таймеру; пустая карта ничего не стоит. */
  sweep(now: number): void {
    for (const [address, box] of this.boxes) {
      const fresh = box.frames.filter((held) => now - held.at <= this.limits.ttlMs)

      if (fresh.length === box.frames.length) continue

      const freed = box.frames
        .filter((held) => now - held.at > this.limits.ttlMs)
        .reduce((sum, held) => sum + held.frame.length, 0)

      this.total -= freed
      box.bytes -= freed
      box.frames = fresh
      this.note(address, box.from, now)

      if (fresh.length === 0) this.boxes.delete(address)
    }

    const stale = this.limits.ttlMs * BROKEN_TTL_FACTOR

    for (const [address, note] of this.broken) {
      if (now - note.at > stale) this.broken.delete(address)
    }
  }

  size(): number {
    return this.boxes.size
  }

  notes(): number {
    return this.broken.size
  }

  heldBytes(): number {
    return this.total
  }

  private drop(address: string, box: Box) {
    this.total -= box.bytes
    this.boxes.delete(address)
  }

  /** Переставляется, а не перезаписывается: порядок карты - порядок времени, старые - первыми. */
  private note(address: string, from: Buffer, now: number) {
    this.broken.delete(address)
    this.broken.set(address, { from: Buffer.from(from), at: now })

    while (this.broken.size > MAX_BROKEN) {
      const oldest = this.broken.keys().next().value

      if (oldest === undefined) break

      this.broken.delete(oldest)
    }
  }
}

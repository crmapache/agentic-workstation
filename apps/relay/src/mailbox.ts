import { controlFrame } from './frame.ts'

/**
 * Что держится для стороны, которой сейчас нет на линии. Коротко намеренно: у IDE свой
 * журнал, и телефон догоняет по номеру, так что ящик лишь переносит мигание - лифт, тоннель,
 * крышку ноутбука, а не ночь. Ничего не пишется на диск: перезапуск релея опустошает ящики,
 * обе стороны переподключаются и догоняют из журнала IDE.
 *
 * Переполненный или протухший ящик не отдаёт хвост с дырой, которую никто не заметит: ящик
 * уходит целиком, а адресат при возвращении получает слово релея (CONTROL) «переспроси» - по
 * одному от каждого, чьи кадры пропали. Спросить дёшево, у IDE есть всё.
 */

export type MailboxLimits = {
  ttlMs: number
  maxFrames: number
  maxBytes: number
  /** Все ящики вместе. */
  totalBytes: number
}

type Held = { frame: Buffer; at: number }

/** Отправители ящика по адресу: пропал ящик - «переспроси» каждому из них, а не первому. */
type Senders = Map<string, Buffer>

type Box = { frames: Held[]; bytes: number; senders: Senders }

/** Заметка «пропустил»: от кого и когда. Копии по 16 байт, а не окна в кадр. */
type Broken = { senders: Senders; at: number }

/** Сколько живёт заметка - кратно жизни кадров: ушедший дольше и так ничего не найдёт. */
const BROKEN_TTL_FACTOR = 10

/** И сколько заметок разом: кадры в никуда оставляют заметки, за которыми никто не придёт. */
const MAX_BROKEN = 50_000

/** Отправителей в одной заметке: больше - уже не мигание, а поток, и спросить хватит первых. */
const MAX_SENDERS = 16

const addSender = (senders: Senders, from: Buffer) => {
  if (senders.size < MAX_SENDERS) senders.set(from.toString('base64url'), Buffer.from(from))
}

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
    const box: Box = this.boxes.get(address) ?? { frames: [], bytes: 0, senders: new Map() }

    box.frames.push({ frame, at: now })
    box.bytes += frame.length
    addSender(box.senders, from)
    this.total += frame.length

    const over =
      box.frames.length > this.limits.maxFrames ||
      box.bytes > this.limits.maxBytes ||
      this.total > this.limits.totalBytes

    if (over) {
      this.drop(address, box)
      this.note(address, box.senders, now)

      return
    }

    this.boxes.set(address, box)
  }

  /** Всё для адреса, старое первым, и ящик пуст. Пропало что-то - первыми слова «переспроси». */
  take(address: string, now: number): Buffer[] {
    const parted = this.broken.get(address)
    const box = this.boxes.get(address)

    this.broken.delete(address)
    if (box) this.drop(address, box)

    const fresh = (box?.frames ?? []).filter((held) => now - held.at <= this.limits.ttlMs)
    const expired = fresh.length < (box?.frames.length ?? 0)
    const senders: Senders = new Map(parted?.senders)

    if (expired) for (const from of box?.senders.values() ?? []) addSender(senders, from)

    const to = Buffer.from(address, 'base64url')

    return [
      ...[...senders.values()].map((from) => controlFrame(to, from)),
      ...fresh.map((held) => held.frame),
    ]
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
      this.note(address, box.senders, now)

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

  /**
   * Кадры от `from` к адресу могли пропасть мимо ящика: ушли в сокет, который уже умер, но
   * ещё не был замечен. При возвращении адресат первым услышит «переспроси» от `from`.
   */
  markLost(address: string, from: Buffer, now: number): void {
    this.note(address, new Map([[from.toString('base64url'), from]]), now)
  }

  private drop(address: string, box: Box) {
    this.total -= box.bytes
    this.boxes.delete(address)
  }

  /**
   * Заметка дополняется, а не перезаписывается: пропало у двоих - переспросят оба. Переставляется
   * в конец: порядок карты - порядок времени, старые - первыми на выход.
   */
  private note(address: string, senders: Senders, now: number) {
    const known = this.broken.get(address)?.senders ?? new Map<string, Buffer>()

    for (const from of senders.values()) addSender(known, from)

    this.broken.delete(address)
    this.broken.set(address, { senders: known, at: now })

    while (this.broken.size > MAX_BROKEN) {
      const oldest = this.broken.keys().next().value

      if (oldest === undefined) break

      this.broken.delete(oldest)
    }
  }
}

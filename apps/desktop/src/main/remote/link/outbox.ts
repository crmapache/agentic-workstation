import type { FrameType } from '@agentic-workstation/remote-protocol/frame'

/** Сколько кадров и байт держит очередь одного устройства, пока до него нет линии. */
export const MAX_FRAMES = 2000

export const MAX_BYTES = 8 * 1024 * 1024

/** Ответы, которых ждёт устройство: держатся отдельно и коротко. */
export const MAX_URGENT = 64

/**
 * Что ждёт отправки: готовый кадр (открытое рукопожатие) или тело, которое запечатается в
 * момент отправки. Печать при отправке, а не при постановке в очередь: номер кадра (счётчик
 * GCM) идёт в порядке ухода в сокет. Иначе срочный ответ, обогнавший сотню ждущих кадров,
 * унёс бы номер выше их всех, и окно повторов телефона (64 номера) выбросило бы их как старые.
 * И кадр, ждавший линии, запечатается ключами, которые у телефона есть сейчас.
 */
export type Outgoing = { frame: Buffer } | { body: Uint8Array; type: FrameType }

/** Обычная очередь кадров или срочная - для ответов, которых ждут (итог команды, рукопожатие). */
export type Lane = 'normal' | 'urgent'

/** Кадр и кому он: не ушедшее возвращается в свою очередь. */
export type Sent = { deviceId: string; frame: Buffer }

/** Запечатать ждущее устройству; ключей нет (отпущен, ключи сменились) - null, кадр выброшен. */
export type Seal = (deviceId: string, outgoing: Outgoing) => Buffer | null

type Queue = {
  /** Уже запечатанные и не ушедшие: их номера раньше всего, что запечатается потом. */
  sealed: Buffer[]
  urgent: Outgoing[]
  items: Outgoing[]
  bytes: number
  /** Очередь обвалилась: первым уйдёт «переспроси со своего номера». */
  resyncNeeded: boolean
}

const emptyQueue = (): Queue => ({
  sealed: [],
  urgent: [],
  items: [],
  bytes: 0,
  resyncNeeded: false,
})

const isEmpty = (queue: Queue) =>
  queue.sealed.length === 0 &&
  queue.items.length === 0 &&
  queue.urgent.length === 0 &&
  !queue.resyncNeeded

const sizeOf = (outgoing: Outgoing): number =>
  'frame' in outgoing ? outgoing.frame.length : outgoing.body.length

/**
 * Что ждёт отправки, пока линии нет, - своя очередь у каждого устройства (как
 * RemoteOutbox в ACC). Переполненная очередь не теряет старое молча, а схлопывается в
 * одну метку «переспроси»: устройство догонит из журнала, где всё есть, а память
 * ограничена по построению. Своя у каждого: телефон в туннеле не выбрасывает кадры
 * ноутбука на столе.
 */
export class RemoteOutbox {
  private readonly devices = new Map<string, Queue>()

  constructor(
    private readonly maxFrames = MAX_FRAMES,
    private readonly maxBytes = MAX_BYTES,
  ) {}

  offer(deviceId: string, outgoing: Outgoing): void {
    const queue = this.queueOf(deviceId)

    // Обвалившуюся незачем наполнять снова: устройство всё равно переспросит.
    if (queue.resyncNeeded) return

    queue.items.push(outgoing)
    queue.bytes += sizeOf(outgoing)

    if (queue.items.length > this.maxFrames || queue.bytes > this.maxBytes) collapse(queue)
  }

  /**
   * Ответ, которого ждут (итог команды, рукопожатие): не сметается вместе с лентой и уходит
   * раньше неё - журнал ленту повторит, а ответ на нажатую кнопку взять больше негде.
   */
  offerUrgent(deviceId: string, outgoing: Outgoing): void {
    const queue = this.queueOf(deviceId)

    if (queue.urgent.length >= MAX_URGENT) queue.urgent.shift()

    queue.urgent.push(outgoing)
  }

  /**
   * Всё ждущее, и очереди пустеют. Порядок: уже запечатанные (их номера старше), метка
   * «переспроси» обвалившейся, срочное, остальное. resyncFrame спрашивается только у
   * обвалившейся и по устройству: метку надо запечатать именно ему.
   */
  drain(seal: Seal, resyncFrame: (deviceId: string) => Buffer | null): Sent[] {
    const out: Sent[] = []
    const push = (deviceId: string, frame: Buffer | null) => {
      if (frame) out.push({ deviceId, frame })
    }

    for (const [deviceId, queue] of this.devices) {
      for (const frame of queue.sealed) push(deviceId, frame)

      if (queue.resyncNeeded) push(deviceId, resyncFrame(deviceId))

      for (const outgoing of [...queue.urgent, ...queue.items])
        push(deviceId, seal(deviceId, outgoing))

      queue.sealed = []
      queue.urgent = []
      queue.items = []
      queue.bytes = 0
      queue.resyncNeeded = false
    }

    for (const [deviceId, queue] of this.devices) if (isEmpty(queue)) this.devices.delete(deviceId)

    return out
  }

  /** Не ушедшее - обратно в начало своей очереди, уже запечатанным: номера у него есть. */
  putBack(rest: readonly Sent[]): void {
    for (const item of [...rest].reverse()) this.queueOf(item.deviceId).sealed.unshift(item.frame)
  }

  forget(deviceId: string): void {
    this.devices.delete(deviceId)
  }

  size(): number {
    return [...this.devices.values()].reduce(
      (sum, queue) => sum + queue.sealed.length + queue.items.length + queue.urgent.length,
      0,
    )
  }

  needsResync(deviceId: string): boolean {
    return this.devices.get(deviceId)?.resyncNeeded ?? false
  }

  clear(): void {
    this.devices.clear()
  }

  private queueOf(deviceId: string): Queue {
    let queue = this.devices.get(deviceId)

    if (!queue) {
      queue = emptyQueue()
      this.devices.set(deviceId, queue)
    }

    return queue
  }
}

/** Схлопнуть: лента уходит, запечатанное тоже (его номера проглотит метка), срочное остаётся. */
const collapse = (queue: Queue) => {
  queue.sealed = []
  queue.items = []
  queue.bytes = 0
  queue.resyncNeeded = true
}

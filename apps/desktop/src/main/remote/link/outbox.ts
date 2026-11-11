/** Сколько кадров и байт держит очередь одного устройства, пока до него нет линии. */
export const MAX_FRAMES = 2000

export const MAX_BYTES = 8 * 1024 * 1024

/** Ответы, которых ждёт устройство: держатся отдельно и коротко. */
export const MAX_URGENT = 64

/** Кадр и кому он: не ушедшее возвращается в свою очередь. */
export type Sent = { deviceId: string; frame: Buffer }

type Queue = {
  frames: Buffer[]
  bytes: number
  /** Очередь обвалилась: первым уйдёт «переспроси со своего номера». */
  resyncNeeded: boolean
  urgent: Buffer[]
}

const emptyQueue = (): Queue => ({ frames: [], bytes: 0, resyncNeeded: false, urgent: [] })

const isEmpty = (queue: Queue) =>
  queue.frames.length === 0 && queue.urgent.length === 0 && !queue.resyncNeeded

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

  offer(deviceId: string, frame: Buffer): void {
    const queue = this.queueOf(deviceId)

    // Обвалившуюся незачем наполнять снова: устройство всё равно переспросит.
    if (queue.resyncNeeded) return

    queue.frames.push(frame)
    queue.bytes += frame.length

    if (queue.frames.length > this.maxFrames || queue.bytes > this.maxBytes) collapse(queue)
  }

  /** Ответ, которого ждут (подтверждение, пуш): не сметается вместе с лентой. */
  offerUrgent(deviceId: string, frame: Buffer): void {
    const queue = this.queueOf(deviceId)

    if (queue.urgent.length >= MAX_URGENT) queue.urgent.shift()

    queue.urgent.push(frame)
  }

  /**
   * Всё ждущее, старое первым, и очереди пустеют. resyncFrame спрашивается только у
   * обвалившейся и по устройству: метку надо запечатать именно ему.
   */
  drain(resyncFrame: (deviceId: string) => Buffer | null): Sent[] {
    const out: Sent[] = []

    for (const [deviceId, queue] of this.devices) {
      if (queue.resyncNeeded) {
        const frame = resyncFrame(deviceId)

        if (frame) out.push({ deviceId, frame })

        queue.resyncNeeded = false
      }

      for (const frame of [...queue.urgent, ...queue.frames]) out.push({ deviceId, frame })

      queue.urgent = []
      queue.frames = []
      queue.bytes = 0
    }

    for (const [deviceId, queue] of this.devices) if (isEmpty(queue)) this.devices.delete(deviceId)

    return out
  }

  /** Не ушедшее - обратно в начало своей очереди, а не в никуда. */
  putBack(rest: readonly Sent[]): void {
    for (const item of [...rest].reverse()) {
      const queue = this.queueOf(item.deviceId)

      if (queue.resyncNeeded) continue

      queue.frames.unshift(item.frame)
      queue.bytes += item.frame.length
    }

    for (const queue of this.devices.values()) {
      if (queue.frames.length > this.maxFrames || queue.bytes > this.maxBytes) collapse(queue)
    }
  }

  forget(deviceId: string): void {
    this.devices.delete(deviceId)
  }

  size(): number {
    return [...this.devices.values()].reduce(
      (sum, queue) => sum + queue.frames.length + queue.urgent.length,
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

const collapse = (queue: Queue) => {
  queue.frames = []
  queue.bytes = 0
  queue.resyncNeeded = true
}

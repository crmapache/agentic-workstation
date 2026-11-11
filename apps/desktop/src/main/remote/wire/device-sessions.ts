import type { FrameType } from '@agentic-workstation/remote-protocol/frame'
import { FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'

import type { SessionKeys } from './crypto'
import { open, seal } from './crypto'
import type { Envelope } from './frame'
import { headerOf, buildFrame } from './frame'
import { ReplayWindow } from './replay-window'

type Live = {
  keys: SessionKeys
  outgoing: bigint
  replay: ReplayWindow
  /** Открылся ли уже кадр устройства на этих ключах - см. Opened.first. */
  heard: boolean
}

/**
 * Чем кончилось открытие кадра. Три исхода, а не «тело или null»: повтор после
 * переподключения - обычная работа релея, а не повод жечь ECDH заново.
 * first - первый кадр на этих ключах: новая страница телефона или дозвон после сна.
 */
export type Opened =
  | { kind: 'body'; bytes: Buffer; first: boolean; keys: SessionKeys }
  | { kind: 'replayed' }
  | { kind: 'unreadable' }

/**
 * Живое шифрованное состояние каждого телефона: ключи соединения, следующий счётчик,
 * что уже видели. Только в памяти: ключи не переживают процесс, и старый счётчик не
 * встретит старый ключ - то единственное правило GCM, от нарушения которого всё рушится.
 */
export class DeviceSessions {
  private readonly devices = new Map<string, Live>()
  /**
   * Ключи, предложенные от имени устройства, у которого уже есть живые. Рукопожатие
   * идёт открыто, сказать «это я, ключи потерял» может кто угодно: живые ключи работают,
   * пока не придёт кадр, запечатанный новыми, - его может сделать только устройство.
   */
  private readonly offered = new Map<string, Live>()

  /** Ключи после пары: ставятся сразу. */
  open(deviceId: string, keys: SessionKeys): void {
    this.devices.set(deviceId, fresh(keys))
    this.offered.delete(deviceId)
  }

  /** Ключи переподключения: без живых - сразу, с живыми - ждут доказательства. */
  offer(deviceId: string, keys: SessionKeys): void {
    if (this.devices.has(deviceId)) this.offered.set(deviceId, fresh(keys))
    else this.devices.set(deviceId, fresh(keys))
  }

  close(deviceId: string): void {
    this.devices.delete(deviceId)
    this.offered.delete(deviceId)
  }

  isOpen(deviceId: string): boolean {
    return this.devices.has(deviceId)
  }

  openDevices(): string[] {
    return [...this.devices.keys()]
  }

  /**
   * Запечатать тело устройству и взять следующий счётчик. Счётчик выдаётся здесь, а не
   * снаружи: он строго растёт на ключ, и два кадра с одним номером в GCM - взлом.
   */
  seal(
    deviceId: string,
    to: Uint8Array,
    from: Uint8Array,
    body: Uint8Array,
    type: FrameType = FRAME_SEALED,
  ): Buffer | null {
    const live = this.devices.get(deviceId)

    if (!live) return null

    live.outgoing += 1n

    const counter = live.outgoing
    const header = headerOf(type, to, from, counter)
    const sealed = seal(live.keys.toDevice, live.keys.noncePrefixToDevice, counter, header, body)

    return buildFrame(type, to, from, counter, sealed)
  }

  /**
   * Открыть кадр устройства. Тег проверяется раньше окна повторов: счётчик лежит в
   * открытом заголовке, и выдуманный номер, сдвинувший окно, глушил бы потом все
   * настоящие кадры молча.
   */
  openFrame(deviceId: string, envelope: Envelope): Opened {
    const live = this.devices.get(deviceId)

    if (!live || envelope.counter < 0n) return { kind: 'unreadable' }

    const body = opened(live, envelope)

    if (body) {
      if (!live.replay.accept(envelope.counter)) return { kind: 'replayed' }

      const first = !live.heard

      live.heard = true

      return { kind: 'body', bytes: body, first, keys: live.keys }
    }

    // Ключи, предложенные, пока старые работали, - и это кадр, который их доказывает.
    const waiting = this.offered.get(deviceId)
    const proved = waiting ? opened(waiting, envelope) : null

    if (!waiting || !proved) return { kind: 'unreadable' }
    if (!waiting.replay.accept(envelope.counter)) return { kind: 'replayed' }

    this.devices.set(deviceId, waiting)
    this.offered.delete(deviceId)
    waiting.heard = true

    return { kind: 'body', bytes: proved, first: true, keys: waiting.keys }
  }
}

const fresh = (keys: SessionKeys): Live => ({
  keys,
  outgoing: 0n,
  replay: new ReplayWindow(),
  heard: false,
})

/** Заголовок - собственный заголовок кадра, вид включён: перевешенный ярлык ломает тег. */
const opened = (live: Live, envelope: Envelope): Buffer | null =>
  open(
    live.keys.toAgent,
    live.keys.noncePrefixToAgent,
    envelope.counter,
    headerOf(envelope.type, envelope.to, envelope.from, envelope.counter),
    envelope.body,
  )

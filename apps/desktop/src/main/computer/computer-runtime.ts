import { app } from 'electron'

import type { CapsuleView, CapsuleAction, ComputerState } from '@shared/computer'

import { IS_WINDOWS } from '../platform'
import { macInput } from './cg-events'
import { readComputerState } from './computer-access'
import { ComputerAgent } from './computer-agent'
import { ComputerCapsule } from './computer-capsule'
import { ComputerDesk } from './computer-desk'
import { ComputerHand } from './computer-hand'
import { windowsInput } from './win-input'

/**
 * Computer Use в IDE (ADR 0057): один стол и одна рука на всю машину, капсула и разрешения
 * macOS. Разрешения перечитываются, когда человек возвращается в IDE, - выдают их в Системных
 * настройках, и macOS о выдаче не сообщает.
 */
export class ComputerRuntime {
  readonly agent: ComputerAgent
  private readonly desk: ComputerDesk
  private readonly capsule: ComputerCapsule
  private access: ComputerState = readComputerState()

  constructor(
    rendererUrl: string | undefined,
    private readonly changed: () => void,
  ) {
    this.capsule = new ComputerCapsule(rendererUrl)
    this.desk = new ComputerDesk((view) => this.capsule.show(view))
    this.agent = new ComputerAgent({
      desk: this.desk,
      hand: new ComputerHand(IS_WINDOWS ? windowsInput : macInput),
      // Каждый вызов - свежие разрешения: человек мог снять их посреди работы, а macOS тогда
      // молча выбрасывает события, и рука думала бы, что действует.
      access: () => this.recheck(),
      passThrough: (isOn) => this.capsule.passThrough(isOn),
      covers: (point) => this.capsule.covers(point),
      hiddenFromShot: (shoot) => this.capsule.hiddenFromShot(shoot),
    })

    app.on('browser-window-focus', () => this.recheck())
  }

  state(): ComputerState {
    return this.access
  }

  /** Перечитать разрешения; поменялись - окну новое состояние коннекторов. */
  recheck(): ComputerState {
    const next = readComputerState()

    if (next.accessibility !== this.access.accessibility || next.screen !== this.access.screen) {
      this.access = next
      this.changed()
    }

    return this.access
  }

  capsuleView(): CapsuleView | null {
    return this.capsule.view()
  }

  /**
   * Модель разговора сказала фразу: капсула покажет её, пока модель думает до следующего шага.
   * Слова приносит тот, кто знает провайдера (ide-features), - Computer о лентах не знает.
   */
  heard(conversationId: string, saying: string): void {
    this.desk.heard(conversationId, saying)
  }

  /**
   * Человек нажал Stop в капсуле: разговор, который держал компьютер, останавливается целиком,
   * а не только его шаг, - иначе модель, получив отказ, тут же брала бы компьютер снова. Ставит
   * тот, кто знает провайдера (ide-features); ключ - разговор или процесс без разговора.
   */
  stopped: (key: string) => void = () => undefined

  control(action: CapsuleAction): CapsuleView | null {
    if (action === 'pause') this.desk.pause()
    else if (action === 'resume') this.desk.resume()
    else {
      const key = this.desk.holding

      this.desk.stop()
      if (key) this.stopped(key)
    }

    return this.desk.view()
  }

  /** Коннектор выключили или удалили: всё, что шло, обрывается, капсула гаснет. */
  idle(): void {
    this.desk.dispose()
  }

  stop(): void {
    this.desk.dispose()
    this.capsule.destroy()
  }
}

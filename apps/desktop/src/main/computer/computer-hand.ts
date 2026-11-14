import type { Motion } from '../browser/human-motion'
import {
  holdMs,
  keyGapMs,
  settleMs,
  humanPath,
  wheelTicks,
  doubleGapMs,
} from '../browser/human-motion'
import { ComputerError, asComputerError } from './computer-error'
import type { Rect } from './computer-geometry'
import { parseChord, PLATFORM_KEYMAP } from './computer-keys'
import type { KeyChord } from './computer-keys'
import {
  STILL_MS,
  HAND_DRIFT_PT,
  STILL_POLL_MS,
  TYPE_RHYTHM_MAX,
  MODIFIER_LEAD_MS,
  STILL_WAIT_MAX_MS,
} from './computer.constants'
import type {
  Point,
  Keymap,
  Modifier,
  InputDriver,
  MouseButton,
  PasteSession,
} from './computer.types'

const INTERRUPTED =
  'The user moved the mouse or clicked while you were acting, so the action stopped partway. ' +
  'Take a screenshot to see what changed before you go on.'

const KEYS_TAKEN =
  'The user pressed a key or the mouse button while you were typing, so typing stopped partway: ' +
  'the focus may have moved to another window. Take a screenshot before you go on.'

const ELEVATED =
  "That window belongs to an app running as administrator: Windows does not let the IDE's " +
  'mouse and keyboard into it. Ask the user to do this step, or to run the app normally.'

const PERSON_BUSY =
  'The user is using the mouse or keyboard right now and has not let go for a while. Wait, ' +
  'or ask them whether to go on.'

/** Живое время руки: паузы настоящие, обрыв сигнала прерывает их своей причиной. */
export const LIVE_MOTION: Motion = {
  random: Math.random,
  now: () => performance.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(asComputerError(signal))
      if (ms <= 0) return resolve()

      const stop = () => {
        clearTimeout(timer)
        reject(asComputerError(signal as AbortSignal))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', stop)
        resolve()
      }, ms)

      signal?.addEventListener('abort', stop, { once: true })
    }),
}

const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) > HAND_DRIFT_PT

const inside = (rect: Rect, point: Point) =>
  point.x >= rect.x &&
  point.y >= rect.y &&
  point.x < rect.x + rect.width &&
  point.y < rect.y + rect.height

const clampInto = (rect: Rect, point: Point): Point => ({
  x: Math.min(Math.max(point.x, rect.x), rect.x + rect.width - 1),
  y: Math.min(Math.max(point.y, rect.y), rect.y + rect.height - 1),
})

/**
 * Рука агента на настоящих мыши и клавиатуре (ADR 0057): ведёт курсор путём человека (ADR 0044),
 * держит кнопку, печатает ритмом. Человек главнее: двинул мышь посреди действия - действие
 * обрывается (рука помнит, куда ставила курсор, и видит, что он не там); двигает её или держит
 * клавишу перед действием - рука ждёт тишины.
 */
export class ComputerHand {
  /** Куда рука поставила курсор последним и предпоследним: система догоняет с задержкой. */
  private placed: Point | null = null
  private previous: Point | null = null

  constructor(
    private readonly input: InputDriver,
    private readonly motion: Motion = LIVE_MOTION,
    private readonly keys: Keymap = PLATFORM_KEYMAP,
  ) {}

  /** Где курсор сейчас - для подписи к снимку. */
  cursor(): Point {
    return this.input.cursor()
  }

  /**
   * Перед действием: человек не трогает мышь и клавиши. Курсор не там, где его оставила рука,
   * или движется, или зажаты кнопка и модификатор - ждать тишины, но не дольше потолка.
   */
  async waitForStill(signal: AbortSignal): Promise<void> {
    const { now, sleep } = this.motion
    const isHolding = () => this.input.isButtonHeld() || this.input.heldFlags() !== 0
    let at = this.input.cursor()
    const isMovedByPerson = this.placed !== null && far(at, this.placed)

    if (!isMovedByPerson && !isHolding()) return

    const started = now()
    let quietFrom = now()

    while (now() - quietFrom < STILL_MS) {
      if (now() - started > STILL_WAIT_MAX_MS) throw new ComputerError('interrupted', PERSON_BUSY)

      await sleep(STILL_POLL_MS, signal)

      const next = this.input.cursor()

      if (far(next, at) || isHolding()) quietFrom = now()

      at = next
    }

    this.placed = null
  }

  /** Довести курсор до точки путём руки; с кнопкой - это перетаскивание. */
  async moveTo(to: Point, area: Rect, signal: AbortSignal, held?: MouseButton): Promise<void> {
    const { now, sleep, random } = this.motion
    const from = this.input.cursor()
    // Путь дуги и проскок у края дисплея не уходят за него: система прижала бы курсор к краю, и
    // рука приняла бы это за руку человека. Переезд на другой дисплей идёт без прижима.
    const isSameDisplay = inside(area, from)
    const steps = humanPath(from, to, random).map((step) =>
      isSameDisplay ? { ...clampInto(area, step), at: step.at } : step,
    )
    const started = now()

    this.placed = from
    this.previous = null

    for (const [index, step] of steps.entries()) {
      const next = steps[index + 1]

      // Опоздавшие шаги пропускаются - путь тот же, рука не замедляется. Последний - всегда.
      if (next && next.at <= now() - started) continue

      await sleep(step.at - (now() - started), signal)
      this.guard(isSameDisplay)
      this.input.mouse(held ? 'drag' : 'move', { x: step.x, y: step.y }, held ?? 'left', 1, 0)
      this.previous = this.placed
      this.placed = { x: step.x, y: step.y }
    }
  }

  /** Клик с модификаторами (⌘-клик): они нажимаются своими клавишами вокруг клика. */
  async click(
    at: Point,
    area: Rect,
    options: { button: MouseButton; count: number; modifiers: readonly Modifier[] },
    signal: AbortSignal,
  ): Promise<void> {
    const { sleep, random } = this.motion

    this.checkReach(at)
    await this.moveTo(at, area, signal)
    await sleep(settleMs(random), signal)
    await this.holding(options.modifiers, signal, async (flags) => {
      for (let click = 1; click <= options.count; click += 1) {
        if (click > 1) await sleep(doubleGapMs(random), signal)

        this.guard(true)
        this.input.mouse('down', at, options.button, click, flags)
        // Кнопку отпускают всегда: обрыв посреди нажатия не должен оставить её зажатой.
        await sleep(holdMs(random)).finally(() =>
          this.input.mouse('up', at, options.button, click, flags),
        )
      }
    })
  }

  async drag(from: Point, to: Point, area: Rect, signal: AbortSignal): Promise<void> {
    const { sleep, random } = this.motion

    this.checkReach(from)
    await this.moveTo(from, area, signal)
    await sleep(settleMs(random), signal)
    this.guard(true)
    this.input.mouse('down', from, 'left', 1, 0)

    try {
      await sleep(holdMs(random), signal)
      await this.moveTo(to, area, signal, 'left')
      await sleep(settleMs(random), signal)
    } finally {
      // Отпустить там, где курсор сейчас: если мышь перехватил человек, событие с точкой
      // назначения дёрнуло бы курсор у него из-под руки.
      this.input.mouse('up', this.input.cursor(), 'left', 1, 0)
    }
  }

  /** Колесо в точке: серия убывающих толчков, как трекпад (ADR 0044). */
  async scroll(at: Point, area: Rect, down: number, right: number, signal: AbortSignal) {
    const { now, sleep, random } = this.motion

    this.checkReach(at)
    await this.moveTo(at, area, signal)
    await sleep(settleMs(random), signal)

    const started = now()

    for (const tick of wheelTicks(right, down)) {
      await sleep(tick.at - (now() - started), signal)
      this.guard(true)
      this.input.scroll(tick.dy, tick.dx)
    }
  }

  /**
   * Текст в то, что сейчас в фокусе. Есть у системы буфер для руки (Windows) - текст вставляется:
   * знаки по одному Windows доставляет занятому приложению вперемешку (ADR 0058). Не взяло
   * вставку - дальше знаками: короткий текст - ритмом руки, длинный - темпом системы. Перевод
   * строки - Return, табуляция - Tab, и между вставками тоже: Return в мессенджере - отправка, и
   * модель на это рассчитывает. Человек кликнул или нажал клавишу посреди набора - фокус мог
   * уйти, и набор обрывается.
   */
  async type(text: string, signal: AbortSignal): Promise<void> {
    const isRhythm = text.length <= TYPE_RHYTHM_MAX

    this.checkReach(null)
    this.placed = this.input.cursor()

    const paste = (await this.input.clipboard?.open()) ?? null
    let isPasting = paste !== null

    try {
      for (const run of pieces(text, Infinity)) {
        this.checkKeyboard(signal)
        this.guard(true)

        if (run === '\n' || run === '\t') {
          await this.tap(run === '\n' ? this.keys.returnKey : this.keys.tabKey, 0, signal)
          await this.motion.sleep(this.gap(run, isRhythm), signal)
          continue
        }

        if (isPasting && paste) isPasting = await this.paste(paste, run, signal)
        if (!isPasting) await this.keyIn(run, isRhythm, signal)
      }
    } finally {
      await paste?.close()
    }
  }

  /**
   * Сочетание клавиш repeat раз, как его жмёт человек: модификаторы - своими клавишами, клавиша
   * между ними держится как у руки. Один модификатор без клавиши - он сам нажат и отпущен.
   */
  async press(chord: KeyChord, repeat: number, signal: AbortSignal): Promise<void> {
    const { sleep, random } = this.motion

    this.checkReach(null)

    for (let time = 0; time < repeat; time += 1) {
      if (time > 0) await sleep(keyGapMs('', random), signal)

      this.checkKeyboard(signal)
      await this.holding(chord.modifiers, signal, (flags) =>
        chord.key === null ? Promise.resolve() : this.tap(chord.key, flags, signal),
      )
    }
  }

  /** Вставить кусок текста: в буфер, cmd+v (на Windows - Ctrl+V), взяло ли приложение. */
  private async paste(session: PasteSession, text: string, signal: AbortSignal): Promise<boolean> {
    const chord = parseChord('cmd+v', this.keys)

    if (!(await session.offer(text))) return false

    await this.holding(chord.modifiers, signal, (flags) =>
      chord.key === null ? Promise.resolve() : this.tap(chord.key, flags, signal),
    )

    return session.taken(signal)
  }

  /** Текст знаками: короткий - по одному ритмом руки, длинный - кусками темпом системы. */
  private async keyIn(text: string, isRhythm: boolean, signal: AbortSignal): Promise<void> {
    const { holdMs, chunk } = this.input.typing
    let previous = ''

    for (const piece of pieces(text, isRhythm ? 1 : chunk)) {
      this.checkKeyboard(signal)
      this.guard(true)

      if (holdMs > 0) {
        this.input.text(piece, 'down')
        // Знак отпускают всегда, как и клавишу.
        await this.motion.sleep(holdMs).finally(() => this.input.text(piece, 'up'))
      } else {
        this.input.text(piece, 'tap')
      }

      await this.motion.sleep(this.gap(previous, isRhythm), signal)
      previous = piece
    }
  }

  /** Пауза после знака: ритм руки, но не короче, чем нужно системе. */
  private gap(previous: string, isRhythm: boolean): number {
    const { gapMs } = this.input.typing

    return isRhythm ? Math.max(keyGapMs(previous, this.motion.random), gapMs) : gapMs
  }

  private async tap(code: number, flags: number, signal: AbortSignal): Promise<void> {
    this.input.key(code, true, flags)
    // Клавишу отпускают всегда - иначе она осталась бы зажатой у человека.
    await this.motion.sleep(holdMs(this.motion.random), signal).finally(() => {
      this.input.key(code, false, flags)
    })
  }

  /**
   * Держать модификаторы, пока идёт работа: нажать по одному, отпустить в обратном порядке -
   * всегда, и при обрыве. Флаг одного события без отпускания клавиши macOS запоминает как
   * зажатый: следующий набор стал бы сочетаниями, у человека тоже.
   */
  private async holding(
    modifiers: readonly Modifier[],
    signal: AbortSignal,
    work: (flags: number) => Promise<void>,
  ): Promise<void> {
    const pressed: Modifier[] = []
    let flags = 0

    try {
      for (const modifier of modifiers) {
        flags |= modifier.flag
        this.input.key(modifier.code, true, flags)
        pressed.push(modifier)
        await this.motion.sleep(MODIFIER_LEAD_MS, signal)
      }

      await work(flags)
    } finally {
      for (const modifier of pressed.reverse()) {
        flags &= ~modifier.flag
        this.input.key(modifier.code, false, flags)
      }
    }
  }

  /**
   * Перед каждым знаком и сочетанием: вызов не оборван, человек не зажал кнопку мыши и
   * модификатор. ⌘Tab, ⌘Space и клик уводят фокус - набор продолжился бы в чужом окне, а перевод
   * строки там - это Return, в мессенджере - отправка. Свои модификаторы рука здесь не держит.
   */
  private checkKeyboard(signal: AbortSignal): void {
    if (signal.aborted) throw asComputerError(signal)

    if (this.input.isButtonHeld() || this.input.heldFlags() !== 0) {
      throw new ComputerError('interrupted', KEYS_TAKEN)
    }
  }

  /**
   * Достанет ли рука до окна в точке (null - до окна в фокусе). Windows не пускает ввод обычной
   * программы в приложение, запущенное от администратора, и не говорит об этом: клик просто
   * пропал бы. На маке такого запрета нет.
   */
  private checkReach(at: Point | null): void {
    if (this.input.canReach && !this.input.canReach(at)) {
      throw new ComputerError('blocked', ELEVATED)
    }
  }

  /** Курсор там, куда его поставила рука; нет - мышь взял человек, действие обрывается. */
  private guard(isChecked: boolean): void {
    if (!isChecked || !this.placed) return

    const at = this.input.cursor()

    if (far(at, this.placed) && (!this.previous || far(at, this.previous))) {
      this.placed = null
      throw new ComputerError('interrupted', INTERRUPTED)
    }
  }
}

/**
 * Текст кусками: переводы строк и табуляции - отдельно (их жмут клавишей), остальное - не
 * длиннее size UTF-16 знаков и без разрыва суррогатной пары.
 */
export const pieces = (text: string, size: number): string[] => {
  const out: string[] = []
  let chunk = ''

  for (const char of text) {
    if (char === '\n' || char === '\t') {
      if (chunk) out.push(chunk)

      out.push(char)
      chunk = ''
      continue
    }

    // Знак из двух половин UTF-16 (эмодзи) длиннее куска в один знак: пустой кусок не нужен -
    // он стал бы нажатием клавиши без текста.
    if (chunk && chunk.length + char.length > size) {
      out.push(chunk)
      chunk = ''
    }

    chunk += char
  }

  if (chunk) out.push(chunk)

  return out
}

/** Точка экрана в точках macOS: начало - левый верхний угол главного дисплея (как у Electron). */
export type Point = { x: number; y: number }

export type MouseButton = 'left' | 'right' | 'middle'

/** Что делает событие мыши: движение без кнопки, нажатие, отпускание, движение с кнопкой. */
export type MouseMotion = 'move' | 'down' | 'up' | 'drag'

/**
 * Настоящие мышь и клавиатура системы - то, что рука агента (computer-hand) двигает и жмёт.
 * На маке это события CoreGraphics (cg-events), в тестах - запись вызовов.
 */
export type InputDriver = {
  /** Где курсор сейчас - по ней рука узнаёт, что мышь взял человек. */
  cursor: () => Point
  mouse: (
    motion: MouseMotion,
    at: Point,
    button: MouseButton,
    clicks: number,
    flags: number,
  ) => void
  key: (keyCode: number, isDown: boolean, flags: number) => void
  /**
   * Текст знаками, а не клавишами: tap - нажатие и отпускание сразу, down и up - порознь, когда
   * система требует держать знак (typing.holdMs).
   */
  text: (chunk: string, phase: TextPhase) => void
  /** Как эта система принимает текст: сколько знаков за событие, сколько держать, пауза между. */
  typing: TypingProfile
  /** Прокрутка в пикселях: вниз и вправо - положительные. */
  scroll: (down: number, right: number) => void
  /** Модификаторы, которые человек держит на клавиатуре. */
  heldFlags: () => number
  /** Человек держит кнопку мыши. */
  isButtonHeld: () => boolean
  /**
   * Примет ли ввод окно в точке экрана (null - окно в фокусе). Нет у мака: там все окна
   * принимают. У Windows - нет у окон приложений, запущенных от администратора.
   */
  canReach?: (at: Point | null) => boolean
  /**
   * Буфер обмена для текста: есть у Windows, там текст вставляется, а не печатается знаками
   * (ADR 0058). У мака нет - знаки CoreGraphics доходят верно.
   */
  clipboard?: TextClipboard
}

/**
 * Вставки текста одного набора. Буфер человека запоминается на открытии и возвращается на
 * закрытии; текст в буфере - отложенный: приложение получает его, только когда попросит, и рука
 * так узнаёт, что вставка принята.
 */
export type PasteSession = {
  /** Положить текст в буфер; false - буфер держит другое приложение. */
  offer: (text: string) => Promise<boolean>
  /** Забрало ли приложение предложенный текст после нажатия вставки. */
  taken: (signal: AbortSignal) => Promise<boolean>
  /** Вернуть человеку его буфер; скопировал он за это время своё - не трогать. */
  close: () => Promise<void>
}

export type TextClipboard = {
  /** Начать вставки; null - буфер не запомнить (занят, слишком велик), текст пойдёт клавишами. */
  open: () => Promise<PasteSession | null>
}

export type TextPhase = 'tap' | 'down' | 'up'

/**
 * Темп текста знаками. Мак берёт до 20 знаков одним событием. Windows - только по знаку, и
 * занятое приложение (новый Блокнот Windows 11) путает знаки, пришедшие быстрее, чем оно их
 * разбирает: 16 мс удержания и 16 мс паузы - каша, 30 и 30 - верно (ADR 0058). Поэтому там
 * знаками текст идёт, только если приложение не приняло вставку.
 */
export type TypingProfile = { chunk: number; holdMs: number; gapMs: number }

/** Модификатор: код его клавиши и флаг, который он даёт событиям, пока зажат. */
export type Modifier = { code: number; flag: number }

/**
 * Клавиатура системы для руки: коды клавиш по именам, модификаторы и их другие имена, клавиши
 * перевода строки и табуляции. У мака и Windows коды и модификаторы свои, имена - общие.
 */
export type Keymap = {
  codes: Readonly<Record<string, number>>
  modifiers: Readonly<Record<string, Modifier>>
  modifierAliases: Readonly<Record<string, string>>
  returnKey: number
  tabKey: number
}

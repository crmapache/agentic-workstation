/**
 * Снимок для модели: не длиннее и не крупнее того, что API Anthropic принимает без своего
 * уменьшения. Иначе API ужал бы картинку сам, и координаты модели уехали бы от наших.
 */
export const SHOT_MAX_SIDE = 1568
export const SHOT_MAX_PIXELS = 1_150_000

/** Снимок крупнее этого в base64 уходит JPEG: PNG рабочего стола с фото бывает в мегабайты. */
export const SHOT_MAX_PNG_BASE64 = 2_500_000
export const SHOT_JPEG_QUALITY = 82

/** После действия - пауза, пока приложение перерисуется, и только потом снимок для модели. */
export const SETTLE_AFTER_ACTION_MS = 450

/** После запуска приложения - дольше: окно открывается и встаёт на место. */
export const SETTLE_AFTER_OPEN_MS = 1200

/** Сколько модель может попросить подождать перед снимком. */
export const WAIT_MAX_S = 10

/**
 * Насколько курсор может разойтись с тем местом, куда его поставила рука, и это ещё не
 * человек: система округляет точку до пикселя экрана и прижимает её к краю дисплея.
 */
export const HAND_DRIFT_PT = 3

/**
 * Человек двигал мышь или держит клавишу - рука ждёт, пока он отпустит: столько тишины,
 * не дольше потолка. Потом действие отказывается: человек работает сам.
 */
export const STILL_MS = 700
export const STILL_POLL_MS = 100
export const STILL_WAIT_MAX_MS = 20_000

/** Модификатор нажат чуть раньше клавиши сочетания - как у руки, и приложение успевает его увидеть. */
export const MODIFIER_LEAD_MS = 30

/** Столько знаков текста печатается по клавише с ритмом руки; длиннее - пачками без пауз. */
export const TYPE_RHYTHM_MAX = 80

/**
 * Вставка текста на Windows (ADR 0058). Приложение берёт текст из буфера за миллисекунды после
 * нажатия; не взяло за PASTE_TAKE_MS - рука ждёт, пока окно в фокусе ответит (не дольше
 * PASTE_FOCUS_WAIT_MS), и ещё PASTE_LATE_MS. Взяло - буфер человека возвращается не раньше
 * PASTE_SETTLE_MS: приложение может прочесть его ещё раз.
 */
export const PASTE_TAKE_MS = 1000
export const PASTE_POLL_MS = 10
export const PASTE_FOCUS_WAIT_MS = 3000
export const PASTE_LATE_MS = 150
export const PASTE_SETTLE_MS = 250

/**
 * Буфер держит другое приложение: столько попыток открыть его, с такой паузой. Вернуть буфер
 * человеку - попыток больше: иначе у него остался бы текст агента.
 */
export const CLIP_OPEN_TRIES = 25
export const CLIP_RESTORE_TRIES = 150
export const CLIP_OPEN_GAP_MS = 20

/**
 * Больше этого буфер человека не запоминается (выделение в таблице на сотни тысяч ячеек): текст
 * тогда идёт клавишами, а буфер не трогается.
 */
export const CLIP_SAVED_MAX_BYTES = 64 * 1024 * 1024

/**
 * Разговор, который взял компьютер, держит его, пока работает: без вызовов столько - отпускает,
 * капсула гаснет, и компьютер может взять другой разговор.
 */
export const HOLD_IDLE_MS = 60_000

/** Пауза держит вызов, пока человек не продолжит, но не дольше этого. */
export const PAUSE_WAIT_MAX_MS = 10 * 60_000

/** Колесо: один «щелчок» в пикселях - как у мыши в macOS. */
export const WHEEL_NOTCH_PX = 80
export const WHEEL_NOTCHES_MAX = 30

/**
 * Капсула: размер окна (вся капсула - окно, без прозрачных полей) и отступ от низа. Ширина - под
 * строку о том, что ИИ делает: фраза модели в 340 резалась на третьем слове.
 */
export const CAPSULE_WIDTH = 420
export const CAPSULE_HEIGHT = 44
export const CAPSULE_BOTTOM_GAP = 16

/** Настройки macOS, где человек даёт IDE доступ к мыши и к экрану. */
export const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
export const SCREEN_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

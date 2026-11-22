import type { EffortLevel, PermissionMode } from './conversation'
import type { SoundEvent } from './sounds'

/**
 * Настройки панели провайдера (экран Settings в боковом меню, ADR 0009, 0083). Все - на
 * машину: это привычки человека, а не свойства репозитория. Владелец - главный процесс,
 * окно получает их в состоянии панели и меняет патчем.
 */

/**
 * Вкладка позвала человека: повод - тот же, что у звука. Его слушают и звук, и
 * свечение фоновой вкладки цветом повода.
 */
export type ConversationCall = { conversationId: string; reason: SoundEvent }

/**
 * Имя модели, которое можно передать аргументом запуска: без пробелов, кавычек,
 * запятых и переводов строк (иначе оболочку, которую никто не звал, обрежет аргумент -
 * опыт ACC). Ещё не с дефиса - CLI прочёл бы флаг: это проверяется отдельно.
 */
export const MODEL_NAME_PATTERN = /^[\w.:[\]/@-]{1,120}$/

/** Сколько цвета у шкал: 100 - лестница от зелёного к красному, 0 - один спокойный тон. */
export const GAUGE_VIVID_FULL = 100
export const GAUGE_VIVID_CALM = 0

/**
 * Показание под полем ввода - токены за день. Остальные показания - окна лимитов, их ключ -
 * группа окна и модель (meterKey в окне).
 */
export const TODAY_TOKENS_METER = 'todayTokens'

/** Кнопок пресетов под полем - не больше трёх: строка под полем одна и узкая (ADR 0096). */
export const MAX_SETUP_PRESETS = 3

/** Имя пресета - подпись кнопки под полем: короткое слово, а не фраза. */
export const PRESET_NAME_MAX = 16

/**
 * Пресет - модель, усилие и режим одной кнопкой под полем ввода (ADR 0096). null у модели и
 * усилия - «по умолчанию», как в индикаторе: так и уходит разговору.
 */
export type SetupPreset = {
  name: string
  model: string | null
  effort: EffortLevel | null
  mode: PermissionMode
}

export type PanelPrefs = {
  /** Модель новой вкладки; null - как в последней выбранной вкладке. */
  newTabModel: string | null
  newTabEffort: EffortLevel | null
  newTabMode: PermissionMode | null
  gaugeVivid: number
  /** Каждое сообщение несёт открытый файл и выделенные строки. */
  shareEditor: boolean
  /**
   * Показания под полем ввода, которые человек спрятал: окна лимитов и токены за день.
   * Хранится спрятанное, а не показанное: окно, о котором сервер скажет завтра, видно сразу.
   */
  hiddenMeters: string[]
  /** Модели, которых нет в каталоге CLI (прокси, шлюз), - добавлены руками. */
  customModels: string[]
  /**
   * Путь к CLI, названный руками (экран «Claude Code not found»): IDE видит не тот PATH,
   * что терминал. Пусто - искать самой; путь, который не отвечает как Claude Code, не берётся.
   */
  cliPath: string
  /** Сколько кнопок пресетов стоит под полем, 0 - ни одной (ADR 0096). */
  presetCount: number
  /**
   * Пресеты по порядку кнопок. Те, что за presetCount, не видны, но хранятся: убрал кнопку и
   * вернул - пресет тот же, а не заново.
   */
  presets: SetupPreset[]
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  newTabModel: null,
  newTabEffort: null,
  newTabMode: null,
  gaugeVivid: GAUGE_VIVID_FULL,
  shareEditor: true,
  hiddenMeters: [],
  customModels: [],
  cliPath: '',
  presetCount: 0,
  presets: [],
}

/**
 * Пресеты, которые стоят кнопками под полем: первые presetCount (ADR 0096). Те же видит и
 * телефон в новом разговоре.
 */
export const shownPresets = (prefs: Pick<PanelPrefs, 'presets' | 'presetCount'>): SetupPreset[] =>
  prefs.presets.slice(0, prefs.presetCount)

/** Изменение настроек: что не названо - остаётся как было. */
export type PanelPrefsPatch = Partial<PanelPrefs>

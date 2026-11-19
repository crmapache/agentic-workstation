import type { SearchTab } from './search.types'

/** Вкладки окна по порядку - по нему их номера в клавишах и шаг по кругу. */
export const SEARCH_TABS: readonly SearchTab[] = ['chat', 'project', 'ai']

/**
 * Клавиши окна поиска, одно семейство ⌥⌘: вкладки по номеру и переключатели поля C и W,
 * как у Find in Files. Голый ⌘ с цифрой занят окном IDE. Подсказки на кнопках окна
 * берут плашки отсюда же.
 */
export const SEARCH_KEYS = {
  chat: ['⌥', '⌘', '1'],
  project: ['⌥', '⌘', '2'],
  ai: ['⌥', '⌘', '3'],
  matchCase: ['⌥', '⌘', 'C'],
  wholeWords: ['⌥', '⌘', 'W'],
} as const satisfies Record<SearchTab | 'matchCase' | 'wholeWords', readonly string[]>

/** Сколько шагов модели под кольцом - старые уже ничего не говорят. */
export const STEPS_SHOWN = 4

/** Счёт секунд прогона модели. */
export const AI_CLOCK_MS = 1000

/**
 * Как часто подсветка в ленте догоняет её изменения: печатающийся ответ меняет ленту
 * десятки раз в секунду, а обход всего текста на каждый кусок - заметное подёргивание.
 */
export const PAINT_INTERVAL_MS = 300

/** Имя подсветки в реестре браузера - ему отвечает правило ::highlight в стилях капсулы. */
export const HIGHLIGHT_NAME = 'claude-search'

/** Сколько страниц выше лента тянет ради находки, прежде чем сказать «нет среди загруженных». */
export const JUMP_PAGE_LIMIT = 40

/** Что подсветка обходит целиком: нарисованная формула и её скрытый исходник для копирования. */
export const PAINT_SKIP_SELECTOR = '.katex, [aria-hidden="true"]'

/** Значки окна и капсулы: лупа в поле, кольцо загрузки, искорка вкладки модели. */
export const SEARCH_ICON_SIZE = 14
export const SEARCH_ICON_STROKE = 1.75

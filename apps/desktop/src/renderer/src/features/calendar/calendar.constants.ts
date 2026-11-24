/** Минут в сутках сетки: позиция встречи - доля от них. */
export const DAY_MINUTES = 24 * 60

/** Встреча короче этого рисуется этой высотой: пятиминутку тоже надо увидеть и нажать. */
export const MIN_BLOCK_MINUTES = 20

/** Сетка открывается за полтора часа до начала рабочего дня: видно и утро перед ним. */
export const SCROLL_BEFORE_WORK_MINUTES = 90

/** Встреча короче этого - название и время одной строкой: две строки в неё не влезут. */
export const COMPACT_BLOCK_MINUTES = 45

/** Дней в неделе сетки; неделя - с понедельника. */
export const WEEK_DAYS = 7

/** Как часто сдвигать линию «сейчас» и отметки «синк N минут назад». */
export const CALENDAR_TICK_MS = 60_000

/** Дней в сетке месяца: шесть недель - любой месяц целиком, с понедельника. */
export const MONTH_GRID_DAYS = 42

/** Встреч в клетке месяца по названию; остальные - «ещё N», они на дне. */
export const MONTH_CELL_EVENTS = 3

/** Пределы ширины боковой панели, px: уже - имена не читаются, шире - сетка тесная. */
export const SIDEBAR_WIDTH_MIN = 200
export const SIDEBAR_WIDTH_MAX = 440

/** Ключ localStorage: вид, открыта ли боковая панель и её ширина. */
export const CALENDAR_STORAGE_KEY = 'agentic-workstation.calendar.v1'

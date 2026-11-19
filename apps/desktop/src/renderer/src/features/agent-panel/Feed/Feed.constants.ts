import type { FeedRow } from '../panel.types'
import type { RowRhythm } from './Feed.types'

/** На каком расстоянии от низа лента ещё считается «у низа» и держится там. */
export const PIN_THRESHOLD_PX = 32

/**
 * Сколько строка, в которой что-то раскрыли, держится на месте: карточка растёт и после
 * отрисовки (дифф разворачивается, доезжает шрифт), каждый рост приходит наблюдателем.
 */
export const HOLD_MS = 600

/** Строка, к которой прыгнули (булавка на полке), встаёт на эту долю высоты сверху. */
export const JUMP_TOP_SHARE = 0.3

/** Сколько найденная строка подсвечена после прыжка. */
export const LIT_MS = 1800

/**
 * После скольких секунд тишины перелив строки статуса гаснет: работа стоит на чужом
 * сервере или зависла, и бегущий блик врал бы, что что-то происходит.
 */
export const STALL_MS = 60_000

/** Как часто тикает строка статуса. */
export const STATUS_TICK_MS = 1000

/** Атрибут строки ленты: по нему место чтения, прыжок и придержка строки. */
export const ROW_ATTRIBUTE = 'data-feed-row'

/**
 * Ритм каждого вида строки. Запись на каждый вид обязательна: новый вид строки без неё
 * не соберётся, а не встанет в ленту с отступами наугад. Отступы по ритму - `.content` в
 * Feed.module.scss, у самих карточек вертикальных полей нет.
 */
export const ROW_RHYTHM: Record<FeedRow['kind'], RowRhythm> = {
  user: 'block',
  assistant: 'block',
  plan: 'block',
  artifact: 'block',
  question: 'block',
  shell: 'block',
  compact: 'block',
  notice: 'block',
  retry: 'block',
  model: 'block',
  limit: 'block',
  think: 'line',
  tools: 'line',
  edit: 'line',
  agent: 'line',
  turn: 'line',
}

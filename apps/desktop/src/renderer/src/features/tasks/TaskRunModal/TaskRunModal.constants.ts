import type { RunSection } from './TaskRunModal.types'

export const RUN_SECTIONS: readonly RunSection[] = ['report', 'log']

/** У поручения первым - оно само: чего ждёт, журнал и история. */
export const GOAL_SECTIONS: readonly RunSection[] = ['goal', 'report', 'log']

/** Сколько строк истории поручения показывать: свежие - сверху. */
export const HISTORY_SHOWN = 30

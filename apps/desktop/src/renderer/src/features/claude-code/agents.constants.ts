import type { ParseKeys } from 'i18next'

import type { ClosedReason, CliTaskOutcome } from '@shared/claude-feed'

import type { StreamSelection } from './streams.types'

/**
 * Сколько шагов агента рисовать в журнале (как в ACC - 300): долгий субагент делает
 * тысячи вызовов, а читают последние. Срезанное - одной строкой сверху.
 */
export const MAX_JOURNAL_STEPS = 300

/**
 * Сколько задания агента показывать (как в ACC): промпт пишется для машины и бывает
 * сколь угодно длинным, а суть поручения всегда в начале.
 */
export const PROMPT_SHOWN_CHARS = 4_000

/** Почему агент закрыт без ответа - словами со стороны агента: он «возвращается», а не «заканчивается». */
export const CLOSED_KEYS: Record<ClosedReason, ParseKeys> = {
  replay: 'claudeCode.agents.closed.replay',
  exited: 'claudeCode.agents.closed.exited',
  stopped: 'claudeCode.agents.closed.stopped',
  turnEnded: 'claudeCode.agents.closed.turnEnded',
  untracked: 'claudeCode.agents.closed.untracked',
  restarted: 'claudeCode.agents.closed.restarted',
}

/** Чем кончилась фоновая команда - слово в строке «Background command … after 5m». */
export const COMMAND_OUTCOME_KEYS: Record<Exclude<CliTaskOutcome, 'untracked'>, ParseKeys> = {
  completed: 'claudeCode.agents.commandOutcome.completed',
  failed: 'claudeCode.agents.commandOutcome.failed',
  stopped: 'claudeCode.agents.commandOutcome.stopped',
}

/** Выбор разговора, пока ничего не выбрано: лента (main), окна агента флота нет. */
export const MAIN_STREAM: StreamSelection = { stream: null, fleet: null }

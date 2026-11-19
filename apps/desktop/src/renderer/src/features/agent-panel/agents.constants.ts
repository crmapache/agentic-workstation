import type { ParseKeys } from 'i18next'

import type { ClosedReason, CliTaskOutcome } from '@shared/conversation-feed'

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
  replay: 'agentPanel.agents.closed.replay',
  exited: 'agentPanel.agents.closed.exited',
  stopped: 'agentPanel.agents.closed.stopped',
  turnEnded: 'agentPanel.agents.closed.turnEnded',
  untracked: 'agentPanel.agents.closed.untracked',
  restarted: 'agentPanel.agents.closed.restarted',
}

/** Чем кончилась фоновая команда - слово в строке «Background command … after 5m». */
export const COMMAND_OUTCOME_KEYS: Record<Exclude<CliTaskOutcome, 'untracked'>, ParseKeys> = {
  completed: 'agentPanel.agents.commandOutcome.completed',
  failed: 'agentPanel.agents.commandOutcome.failed',
  stopped: 'agentPanel.agents.commandOutcome.stopped',
}

/** Выбор разговора, пока ничего не выбрано: лента (main), окна агента флота нет. */
export const MAIN_STREAM: StreamSelection = { stream: null, fleet: null }

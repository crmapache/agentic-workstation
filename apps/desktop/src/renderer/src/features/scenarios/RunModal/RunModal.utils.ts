import type { TFunction } from 'i18next'

import { answerLabel } from '@shared/scenario-rules'
import type { RunState, ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'

import { formatCost, formatTokens, formatDuration } from '../scenarios-format.utils'
import { startedLabel } from '../scenarios-moments.utils'
import { runWorked } from '../scenarios-timeline.utils'
import { MARK_CHARS } from '../scenarios.constants'
import type { RoadMood } from '../ScenarioRoadmap/ScenarioRoadmap.types'
import type { RunOpening, RunReading } from './RunModal.types'

/**
 * Где открывается таймлайн: итог законченного прогона, ошибка, вопрос и лимит стоят над
 * таймлайном - их читают первыми, и окно тогда наверху. Иначе - у строки, где прогон сейчас.
 */
export const openingOf = (
  run: Pick<ScenarioRun, 'state' | 'error' | 'question' | 'limit'>,
): RunOpening =>
  isRunFinished(run.state) || run.error.length > 0 || run.question !== null || Boolean(run.limit)
    ? 'top'
    : 'present'

/** Что прогон делает на текущей остановке дороги: вопрос - ждёт человека, конец - настоящего нет. */
export const roadMoodOf = (state: RunState): RoadMood => {
  if (isRunFinished(state)) return 'over'
  if (state === 'blocked') return 'asking'

  return state === 'paused' ? 'paused' : 'working'
}

/**
 * Строка цифр прогона: время работы (без пауз и вопросов человеку - «took» у законченного),
 * токены, деньги - только те, что есть, и когда начат. Три показания держатся вместе.
 */
export const readingsOf = (t: TFunction, run: ScenarioRun, now: number): RunReading[] => {
  const worked = {
    key: 'worked',
    label: isRunFinished(run.state) ? t('scenarios.run.took') : t('scenarios.run.active'),
    value: formatDuration(runWorked(run, now)),
  }
  const tokens = {
    key: 'tokens',
    label: t('scenarios.run.tokens'),
    value: formatTokens(run.tokens),
  }
  const cost = { key: 'cost', label: t('scenarios.run.cost'), value: formatCost(run.cost) }
  const started = {
    key: 'started',
    label: t('scenarios.run.started'),
    value: startedLabel(run.startedAt),
  }

  return [worked, ...(run.tokens > 0 ? [tokens] : []), ...(run.cost > 0 ? [cost] : []), started]
}

/**
 * Строка под именем сценария в шапке окна: очередь и первый ответ - по ним различаются два
 * прогона одного сценария. Пусто - различать нечем, и строки нет.
 */
export const runDescription = (queueName: string, inputs: Readonly<Record<string, string>>) =>
  [queueName, answerLabel(inputs, MARK_CHARS)].filter(Boolean).join(' · ')

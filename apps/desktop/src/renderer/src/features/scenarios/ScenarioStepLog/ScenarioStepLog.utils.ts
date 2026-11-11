import type { TFunction } from 'i18next'

import type { ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'

import { stepFacts } from '../scenarios-run.utils'
import { stepWorked } from '../scenarios-timeline.utils'
import type { ConversationSpeaker } from '../../../state/conversation-log.context'
import { HEAD_LOG } from './ScenarioStepLog.constants'

/**
 * Растёт ли журнал сейчас: главный поток - пока прогон не кончился, шаг - пока он начат и не
 * закончен. Такой журнал перечитывается по часам, законченный - нет.
 */
export const isLogLive = (run: Pick<ScenarioRun, 'state' | 'steps'>, key: string): boolean => {
  if (isRunFinished(run.state)) return false
  if (key === HEAD_LOG) return true

  const step = run.steps.find((one) => one.key === key)

  return step !== undefined && step.startedAt > 0 && step.finishedAt === 0
}

/** Кто в журнале пишет за человека: карточке - главный поток, главному потоку - сам прогон. */
export const speakerOf = (key: string): ConversationSpeaker =>
  key === HEAD_LOG ? 'scenario' : 'main'

/**
 * Что сейчас открыто - строкой под заголовком окна: «Step · Fix it · 3m 05s · 46k · $0.31» или
 * «Main thread». У шага, что ещё идёт, времени нет: цифре, что бежит, не место в строке, что стоит.
 */
export const logSubject = (t: TFunction, run: Pick<ScenarioRun, 'steps'>, key: string): string => {
  if (key === HEAD_LOG) return t('scenarios.run.log.head')

  const step = run.steps.find((one) => one.key === key)

  if (!step) return t('scenarios.run.log.step', { title: '' })

  const worked = step.finishedAt > 0 ? stepWorked(step, step.finishedAt) : 0
  const facts = stepFacts(worked, step.tokens, step.cost)

  return [t('scenarios.run.log.step', { title: step.title }), facts].filter(Boolean).join(' · ')
}

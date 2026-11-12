import type { TFunction } from 'i18next'

import type {
  ScenarioWire,
  ScenarioCardWire,
  ScenarioStageWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'

/**
 * Модель, усилие и режим одной строкой: «opus · High effort · Plan first». Пустое - как у
 * головы (у карточки) или как в настройках (у головы), и в строку не идёт.
 */
export const runFacts = (
  t: TFunction,
  setup: Pick<ScenarioCardWire, 'model' | 'effort' | 'permissionMode'>,
): string =>
  [
    setup.model,
    setup.effort && t(`effort.${setup.effort}`, { defaultValue: setup.effort }),
    setup.permissionMode &&
      t(`modes.${setup.permissionMode}.label`, { defaultValue: setup.permissionMode }),
  ]
    .filter(Boolean)
    .join(' · ')

/** Как этап повторяется: по пункту списка, до готовности, N раз; обычный - пусто. */
export const stageRepeat = (t: TFunction, stage: ScenarioStageWire): string => {
  if (stage.each) return t('scenario.stage.each', { name: stage.each.name })
  if (stage.untilDone) return t('scenario.stage.untilDone', { count: stage.repeat })
  if (stage.repeat > 1) return t('scenario.stage.repeat', { count: stage.repeat })

  return ''
}

/** Что голова делает с вопросом карточки и сколько раз возвращает несделанное. */
export const headRules = (t: TFunction, head: ScenarioWire['head']): string =>
  [
    t(`scenario.head.onQuestion.${head.onQuestion}`, { defaultValue: head.onQuestion }),
    head.retries > 0 && t('scenario.head.retries', { count: head.retries }),
  ]
    .filter(Boolean)
    .join(' · ')

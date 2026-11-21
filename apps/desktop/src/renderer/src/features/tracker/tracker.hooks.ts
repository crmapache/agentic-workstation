import { useTranslation } from 'react-i18next'

import type {
  TrackerDue,
  TrackerCode,
  TrackerRepeat,
  TrackerScenario,
  TrackerSendCode,
} from '@shared/tracker'

import { useScenarioShelves } from '../../state/scenarios.queries'
import { useActiveProject } from '../../state/workspace.queries'
import { dueLabel, repeatWords } from './tracker.utils'

/** Сценарии открытого проекта с обеих полок: выбор для карточки и имя на её метке. */
export const useShelfScenarios = () => {
  const project = useActiveProject()
  const { data } = useScenarioShelves(project?.id ?? null)

  return data?.scenarios ?? []
}

/** Имя сценария карточки; сценария нет на полке - его id, чтобы метка не пропала. */
export const useScenarioName = (binding: TrackerScenario | null): string => {
  const scenarios = useShelfScenarios()

  if (!binding) return ''

  return (
    scenarios.find((one) => one.id === binding.scenarioId && one.scope === binding.scope)?.name ??
    binding.scenarioId
  )
}

/** Повтор словами окна: «Every weekday», «Every month on the 31st». */
export const useRepeatLabel = () => {
  const { t } = useTranslation()

  return (repeat: TrackerRepeat): string => {
    const { key, values } = repeatWords(repeat)

    return t(`tracker.repeat.${key}`, values)
  }
}

/** Отказ трекера или сценариев словами окна: свой код трекера, иначе код сценариев. */
export const useFailureText = () => {
  const { t } = useTranslation()

  return (code: TrackerCode | TrackerSendCode): string =>
    t(`tracker.codes.${code}`, {
      defaultValue: t(`scenarios.codes.${code}`, { defaultValue: t('tracker.codes.unknown') }),
    })
}

/** Срок карточки словами окна: «Today 09:30», «Fri»; без срока - пусто. */
export const useDueLabel = (due: TrackerDue | null, today: number): string => {
  const { t } = useTranslation()

  return due
    ? dueLabel(due, today, {
        today: t('tracker.due.today'),
        tomorrow: t('tracker.due.tomorrow'),
        yesterday: t('tracker.due.yesterday'),
      })
    : ''
}

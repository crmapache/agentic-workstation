import { modelLabelOf, modelFamilyOf, CLAUDE_MODEL_FAMILIES } from '@shared/claude-models'
import { ALL_EFFORT_LEVELS } from '@shared/conversation'
import type { ProviderModel } from '@shared/providers'
import type { RunsOn } from '@shared/scenario-queues'

import type { RunsOnChip } from './QueueCard.types'

/** Место уровня на шкале усилия; незнакомый - в конец, в том порядке, как пришёл. */
const effortRank = (effort: string): number => {
  const at = ALL_EFFORT_LEVELS.findIndex((level) => level === effort)

  return at < 0 ? ALL_EFFORT_LEVELS.length : at
}

/**
 * На чём идёт сценарий - чипами по модели: у сценария с десятком карточек моделей две-три, а
 * пар «модель и усилие» - вдвое больше. Модели - в порядке первого появления (голова первой),
 * уровни внутри - по шкале; пустой уровень (решает CLI) не называется.
 */
export const runsOnChips = (runsOn: readonly RunsOn[]): RunsOnChip[] => {
  const chips = new Map<string, Set<string>>()

  for (const { model, effort } of runsOn) {
    const efforts = chips.get(model) ?? new Set<string>()

    if (effort) efforts.add(effort)

    chips.set(model, efforts)
  }

  return [...chips].map(([model, efforts]) => ({
    model,
    efforts: [...efforts].sort((left, right) => effortRank(left) - effortRank(right)),
  }))
}

/**
 * Имя модели, как его даёт меню MODEL редактора: подпись каталога провайдера; модель Claude не
 * из каталога - по имени («claude-opus-4-8» - «Opus 4.8»), чужая - как есть. Пусто - модель по
 * умолчанию: её слово - у окна.
 */
export const modelName = (model: string, models: readonly ProviderModel[]): string =>
  models.find((one) => one.value === model)?.displayName ??
  modelLabelOf(model, modelFamilyOf(model, CLAUDE_MODEL_FAMILIES))

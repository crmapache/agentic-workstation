import type { ModelInfo, EffortLevel } from '@shared/conversation'
import { ALL_EFFORT_LEVELS } from '@shared/conversation'

import { modelFamily } from './model-chip.utils'
import type { PickableModel } from './models.types'
import {
  MODEL_RANK,
  MAIN_MODELS,
  DEFAULT_MODEL_VALUE,
} from './ComposerStatus/ComposerStatus.constants'

/**
 * Место модели в порядке «сильнейшая первой»; модель без семьи Claude - после всех. Каталог
 * Codex приходит уже в этом порядке (`main/codex/catalog/model-lineup.ts`): здесь он не меняется.
 */
const rankOf = (model: ModelInfo): number => {
  const family = modelFamily(model.value)

  return family ? MODEL_RANK.indexOf(family) : MODEL_RANK.length
}

/**
 * Основные модели каталога - сильнейшая первой. Остальные (старые версии) остаются за ними
 * в порядке CLI: в меню они в свёрнутой группе, а сортировка по семье вытащила бы старый
 * Opus наверх и столкнула бы Haiku в группу.
 */
const strongestFirst = (models: readonly ModelInfo[]): ModelInfo[] => {
  const main = models.slice(0, MAIN_MODELS - 1)

  return [...main.sort((a, b) => rankOf(a) - rankOf(b)), ...models.slice(MAIN_MODELS - 1)]
}

/**
 * Модели для меню: каталог CLI (пока его нет - запасной провайдера; у Claude он есть, у
 * других - пусто: чужие модели в меню не встают), без «по умолчанию» - в панели
 * это отдельный пункт, основные - сильнейшая первой; дальше свои, добавленные руками, если
 * их нет в каталоге. Один список для MODEL под полем и для новых вкладок: в чём можно
 * работать, с того можно и начинать.
 */
export const pickableModels = (
  catalog: readonly ModelInfo[],
  custom: readonly string[],
  fallback: readonly ModelInfo[] = [],
): PickableModel[] => {
  const known = strongestFirst(
    (catalog.length > 0 ? catalog : fallback).filter(
      (model) => model.value !== DEFAULT_MODEL_VALUE,
    ),
  )
  const values = new Set(known.map((model) => model.value))

  return [
    ...known.map((model) => ({ ...model, custom: false })),
    ...custom
      .filter((name) => !values.has(name))
      .map((name) => ({ value: name, displayName: name, description: '', custom: true })),
  ]
}

/** Имя модели для подписи: из каталога, иначе как есть (своя модель - и есть имя). */
export const modelLabel = (value: string, models: readonly PickableModel[]): string =>
  models.find((model) => model.value === value)?.displayName ?? value

/**
 * Уровни усилия модели разговора, сильнейший первым: свой список модели (у Codex он у
 * каждой модели свой), иначе уровни провайдера. Без выбора - модель по умолчанию каталога.
 */
export const effortLevels = (
  catalog: readonly ModelInfo[],
  model: string | null,
  fallback: readonly EffortLevel[],
): EffortLevel[] => {
  const info = catalog.find((item) => (model ? item.value === model : item.isDefault))
  // Свой список модели - и пустой: модель без уровней (открытая без рассуждения) их не получает.
  const levels = info?.efforts ?? fallback

  return ALL_EFFORT_LEVELS.filter((level) => levels.includes(level)).toReversed()
}

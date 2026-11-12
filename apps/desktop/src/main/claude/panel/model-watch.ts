import {
  bareModelId,
  modelFamilyOf,
  modelVersionOf,
  PANEL_MODEL_FAMILIES,
} from '@shared/claude-models'
import type { ModelNote } from '@shared/claude-panel'

/**
 * Судьба выбора модели (как в ACC, models.md): чип MODEL держит ВЫБОР, пока выбор не
 * подтвердился подписью ответа; выбор, который не доехал, и смена модели самим CLI -
 * новость: строка в ленте и жёлтый акцент на чипе. Одна и та же модель приходит под
 * тремя именами сразу (выбор «opus[1m]», развёрнутое «claude-opus-5[1m]», подпись
 * «claude-opus-5-5»), поэтому сравнивается семья и поколение, а не строка.
 */

/** Что известно о модели разговора. */
export type ModelWatchState = {
  /** Последняя подпись ответа основного потока; пусто - ещё не было. */
  streamModel: string
  /** Последний выбор человека и во что его развернул каталог («» - не знает). */
  ownModel: string
  ownResolved: string
  /** Выбор в пути: подпись покидаемой модели пока ничего не доказывает. */
  ownSwap: boolean
  /** После выбора ушёл новый запрос: подпись покидаемой модели теперь значит «не доехал». */
  ownSwapDue: boolean
  note: ModelNote | undefined
}

/** Что стоит строкой в ленте: выбор не доехал или CLI сам сменил модель. */
export type ModelEvent =
  | { kind: 'stuck'; picked: string; running: string }
  | { kind: 'swap'; from: string; to: string }
  | null

export const NO_WATCH: ModelWatchState = {
  streamModel: '',
  ownModel: '',
  ownResolved: '',
  ownSwap: false,
  ownSwapDue: false,
  note: undefined,
}

/** Семья из любого имени модели; пусто - семья не наша (default, своя модель шлюза). */
const modelFamily = (model: string): string => modelFamilyOf(model, PANEL_MODEL_FAMILIES) ?? ''

/**
 * Ключ модели для сравнения: семья и поколение, без метки окна и даты сборки (ModelNames.key
 * в ACC). Им же каталог аккаунта решает, умеет ли он модель (accounts/model-catalog.ts).
 */
export const modelKey = (model: string): string => {
  const family = modelFamily(model) || bareModelId(model).replace(/^claude-/, '')
  const version = modelVersionOf(model)

  return version ? `${family}-${version}` : family
}

/** Два имени одной модели: метка окна и дата сборки не в счёт. */
export const sameModel = (one: string, other: string): boolean => modelKey(one) === modelKey(other)

/**
 * Несёт ли подпись этот выбор: да, нет или не понять. С поколением - по самой модели, без
 * него - по семье; выбор, который не прочесть («default» без каталога, модель шлюза,
 * opusplan - за ним две модели сразу), ответа не даёт.
 */
export const carriesPick = (pick: string, signature: string, resolved = ''): boolean | null => {
  if (modelFamily(pick) === 'opusplan') return null

  const measure = resolved || pick
  const family = modelFamily(measure)

  if (!family) return null

  return modelVersionOf(measure) ? sameModel(measure, signature) : family === modelFamily(signature)
}

/**
 * Человек выбрал модель. Ждать подтверждения есть смысл, только когда есть с чем
 * сравнивать и выбор не то, что уже работает: иначе ожидание висело бы вечно и
 * проглотило бы первую настоящую смену модели самим CLI.
 */
export const watchPicked = (
  state: ModelWatchState,
  model: string,
  resolved: string,
): ModelWatchState => {
  const working =
    !state.streamModel ||
    sameModel(state.streamModel, model) ||
    carriesPick(model, state.streamModel, resolved) === true

  return {
    ...state,
    ownModel: model,
    ownResolved: resolved,
    ownSwap: working ? state.ownSwap : true,
    ownSwapDue: working ? state.ownSwapDue : false,
    note: undefined,
  }
}

/**
 * Пошёл запрос, который мог унести выбор: вернулся вызов инструмента или начался свой
 * ход. До него подпись покидаемой модели ничего не доказывает.
 */
export const watchRequest = (state: ModelWatchState): ModelWatchState =>
  state.ownSwap ? { ...state, ownSwapDue: true } : state

const arrivedAsPicked = (state: ModelWatchState, named: string) =>
  !state.ownModel || carriesPick(state.ownModel, named, state.ownResolved) !== false

const settledPick = (state: ModelWatchState, named: string): ModelWatchState => ({
  ...state,
  streamModel: named,
  ownSwap: false,
  ownSwapDue: false,
  note: undefined,
})

/** Подпись ответа основного потока: что стало с выбором и не сменил ли CLI модель сам. */
export const watchSigned = (
  state: ModelWatchState,
  named: string,
): [ModelWatchState, ModelEvent] => {
  const previous = state.streamModel

  if (!previous || sameModel(previous, named)) {
    if (!state.ownSwap) return [{ ...state, streamModel: named }, null]
    if (!state.ownSwapDue) return [{ ...state, streamModel: named }, null]
    if (arrivedAsPicked(state, named)) return [settledPick(state, named), null]

    const stuck: ModelWatchState = {
      ...state,
      streamModel: named,
      ownSwap: false,
      ownSwapDue: false,
      note: { kind: 'stuck', picked: state.ownModel },
    }

    return [stuck, { kind: 'stuck', picked: state.ownModel, running: named }]
  }

  if (state.ownSwap && arrivedAsPicked(state, named)) return [settledPick(state, named), null]

  // Третья модель: CLI перевёл разговор сам - новость, что бы человек ни выбрал только что.
  const swapped: ModelWatchState = {
    ...state,
    streamModel: named,
    ownSwap: false,
    ownSwapDue: false,
    note: { kind: 'swapped', from: previous },
  }

  return [swapped, { kind: 'swap', from: previous, to: named }]
}

/** CLI объявил смену модели сам (fallback): строку уже поставила лента, здесь - акцент. */
export const watchFellBack = (
  state: ModelWatchState,
  from: string,
  to: string,
): ModelWatchState => ({
  ...state,
  streamModel: to,
  ownSwap: false,
  ownSwapDue: false,
  note: { kind: 'swapped', from },
})

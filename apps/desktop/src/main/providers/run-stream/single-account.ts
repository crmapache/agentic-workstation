import type { EngineAccounts } from '../../scenarios/engine/engine-core'

/**
 * Аккаунтов нет или вход один (открытые модели - ключи подключений, а не вход; Kimi - один вход
 * своей папки IDE): прогон идёт на одном «аккаунте» без имени, выручки на лимите нет - упавший
 * на лимите провайдера ход - обычный сбой.
 */
export const SINGLE_ACCOUNT: EngineAccounts = {
  current: () => '',
  label: () => '',
  candidates: () => [],
  same: (left, right) => left === right,
  noteRefused: () => undefined,
}

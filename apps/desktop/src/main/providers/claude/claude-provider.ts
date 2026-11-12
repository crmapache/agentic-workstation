import type { ModelInfo, ClaudeState } from '@shared/claude'
import type { ProviderInfo, ProviderModel } from '@shared/providers'

/**
 * Claude Code как провайдер для всего, что не панель Claude (сценарии, их редактор и запуск):
 * на месте ли CLI и на каких моделях он работает. Чистые функции - держит тест.
 */

/** Пока CLI не прислал каталог аккаунта - семьи, которые он знает всегда. Имена - данные CLI. */
export const CLAUDE_FALLBACK_MODELS: readonly ModelInfo[] = [
  { value: 'opus', displayName: 'Opus', description: '' },
  { value: 'sonnet', displayName: 'Sonnet', description: '' },
  { value: 'haiku', displayName: 'Haiku', description: '' },
]

/** Что Claude Code знает сейчас: нашёлся ли CLI, каталог моделей аккаунта и свои модели. */
export type ClaudeFacts = {
  found: boolean
  catalog: readonly ModelInfo[]
  customModels: readonly string[]
}

/**
 * Модели Claude Code: каталог аккаунта в порядке CLI (его «по умолчанию» тоже - решать, как его
 * показать, тому, кто показывает), за ним свои модели человека, которых в каталоге нет.
 */
export const claudeModels = (
  catalog: readonly ModelInfo[],
  customModels: readonly string[],
): ProviderModel[] => {
  const known = catalog.length > 0 ? catalog : CLAUDE_FALLBACK_MODELS
  const values = new Set(known.map((model) => model.value))

  return [
    ...known.map(({ value, displayName, description }) => ({
      value,
      displayName,
      description,
      custom: false,
    })),
    ...[...new Set(customModels)]
      .filter((name) => !values.has(name))
      .map((name) => ({ value: name, displayName: name, description: '', custom: true })),
  ]
}

export const claudeProvider = ({ found, catalog, customModels }: ClaudeFacts): ProviderInfo => ({
  id: 'claude',
  label: 'Claude Code',
  available: found,
  unavailable: found ? null : 'noCli',
  models: claudeModels(catalog, customModels),
})

/**
 * Claude Code по состоянию панели - без нового поиска CLI: так провайдер пересчитывается на
 * каждое состояние. CLI ещё ищут (unknown) - null: сказать «нет CLI» было бы неправдой.
 */
export const claudeProviderOf = (
  state: Pick<ClaudeState, 'cli' | 'models' | 'prefs'>,
): ProviderInfo | null =>
  state.cli === 'unknown'
    ? null
    : claudeProvider({
        found: state.cli === 'found',
        catalog: state.models,
        customModels: state.prefs.customModels,
      })

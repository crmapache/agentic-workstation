import type { TFunction } from 'i18next'

import type { AiChoice } from '@shared/ide-prefs'
import { PASTE_COLLAPSE_MAX, PASTE_COLLAPSE_MIN } from '@shared/ide-prefs'
import type { ProviderInfo } from '@shared/providers'
import { providerEfforts } from '@shared/providers'

import type { ChoiceOption } from '@agentic-workstation/ui/ChoiceField.types'

import { takesIdeWork } from '../../../lib/provider-choices'

/**
 * Набранное в поле - в порог сворачивания вставки: целое в пределах. Недописанное и
 * нечитаемое - fallback: человек, стерший число, чтобы набрать новое, ещё ничего не попросил.
 */
export const clampPasteCollapse = (typed: string, fallback: number): number => {
  const lines = Number.parseInt(typed, 10)

  if (!Number.isFinite(lines)) return fallback

  return Math.min(PASTE_COLLAPSE_MAX, Math.max(PASTE_COLLAPSE_MIN, lines))
}

/** Уровни усилия модели провайдера: первым - «по умолчанию» (пусто), как решит провайдер. */
export const effortChoices = (
  provider: ProviderInfo | null,
  model: string,
  t: TFunction,
): ChoiceOption[] => [
  { value: '', label: t('settings.git.defaultEffort') },
  ...providerEfforts(provider, model).map((level) => ({
    value: level,
    label: t(`agentPanel.effort.levels.${level}`),
  })),
]

/**
 * Новый запасной: первый провайдер, который возьмёт работу IDE и которого ещё нет в цепочке, -
 * второй тот же провайдер помог бы, только если лимит у модели; нет такого - первый годный.
 */
export const nextFallback = (
  chain: readonly AiChoice[],
  providers: readonly ProviderInfo[],
): AiChoice => {
  const usable = providers.filter(takesIdeWork)
  const fresh = usable.find((one) => !chain.some((choice) => choice.provider === one.id))
  const provider = fresh?.id ?? usable[0]?.id ?? 'claude'

  return { provider, model: '', effort: '' }
}

/**
 * Правка одного звена: другой провайдер - модель и усилие заново (имена у провайдеров свои);
 * другая модель - усилие остаётся, если модель его знает.
 */
export const editChoice = (
  choice: AiChoice,
  patch: Partial<AiChoice>,
  provider: ProviderInfo | null,
): AiChoice => {
  if (patch.provider && patch.provider !== choice.provider) {
    return { provider: patch.provider, model: '', effort: '' }
  }

  const next = { ...choice, ...patch }
  const known = next.effort === '' || providerEfforts(provider, next.model).includes(next.effort)

  return known ? next : { ...next, effort: '' }
}

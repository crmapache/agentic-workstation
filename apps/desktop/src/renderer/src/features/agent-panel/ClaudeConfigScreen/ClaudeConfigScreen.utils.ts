import type { TFunction } from 'i18next'

import type { ClaudeConfigOutcome, ClaudeConfigSetting } from '@shared/claude-config'

import { DECIDED_BY_CHIPS } from './ClaudeConfigScreen.constants'

/** Настройка ровно «вкл/выкл» - переключатель, а не два слова на выбор. */
export const isSwitch = (setting: ClaudeConfigSetting): boolean =>
  setting.options.length === 2 &&
  setting.options.includes('true') &&
  setting.options.includes('false')

/** Вариант словами панели, где CLI говорит true/false; остальное - его собственные имена. */
export const optionWord = (option: string, t: TFunction): string => {
  if (option === 'true') return t('agentPanel.claudeConfig.on')
  if (option === 'false') return t('agentPanel.claudeConfig.off')

  return option
}

/**
 * Пояснение под подписью ряда. Блокировка говорит, где задано, - вместо того чтобы
 * притворяться изменяемой. Неизвестное значение - «решает Claude Code», а не догадка.
 */
export const settingNote = (
  setting: ClaudeConfigSetting,
  pending: string | null,
  t: TFunction,
): string | undefined => {
  if (pending === setting.key) return t('agentPanel.claudeConfig.saving')
  if (setting.lockedBy) return t(`agentPanel.claudeConfig.locked.${setting.lockedBy}`)

  const lines = [
    setting.value === null ? t('agentPanel.claudeConfig.notSet') : '',
    DECIDED_BY_CHIPS.has(setting.key) ? t('agentPanel.claudeConfig.chips') : '',
    // Где ляжет, там и действует: переключатель, который в соседнем проекте «не
    // работает», - переключатель, о котором не сказали.
    setting.projectOnly ? t('agentPanel.claudeConfig.projectOnly') : '',
  ].filter(Boolean)

  return lines.length > 0 ? lines.join(' ') : undefined
}

/**
 * Отказы по рядам после правки: принятая снимает свой, непринятая ставит слова CLI
 * (пусто - свои слова экрана). Отказы других рядов не трогаются.
 */
export const nextFailures = (
  failures: Record<string, string>,
  key: string,
  outcome: ClaudeConfigOutcome | null,
  fallback: string,
): Record<string, string> => {
  const { [key]: _previous, ...rest } = failures

  if (outcome?.ok) return rest

  return { ...rest, [key]: outcome?.message || fallback }
}

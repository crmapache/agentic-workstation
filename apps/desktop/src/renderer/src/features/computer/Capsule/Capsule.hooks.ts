import { useTranslation } from 'react-i18next'

import type { CapsuleView } from '@shared/computer'

/**
 * Строка капсулы словами: на паузе - пауза; слова ИИ о шаге или его фраза - как есть; шаг без
 * слов - действие словами окна; сказать нечего - состояние («Thinking…»). Капсулы нет - пусто.
 */
export const useCapsuleLine = (view: CapsuleView | null): string => {
  const { t } = useTranslation()

  if (!view) return ''

  const { state, activity } = view

  if (state === 'paused') return t('computer.capsule.paused')

  if (!activity) return t(`computer.capsule.${state}`)

  return activity.kind === 'action'
    ? t(`computer.capsule.actions.${activity.action}`, { detail: activity.detail })
    : activity.text
}

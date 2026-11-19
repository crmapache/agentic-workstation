import type { TFunction } from 'i18next'

import type { Conversation } from '@shared/conversation'
import { effortLevelOf, PERMISSION_MODES } from '@shared/conversation'
import type { PanelPrefs } from '@shared/panel-prefs'

import type { PickableModel } from '../models.types'
import { modelLabel } from '../models.utils'
import type { NewChatField } from './NewChatScreen.types'

/** Чему равно поле вкладки словами: модель, усилие или режим; null - «как в CLI». */
export const fieldWord = (
  field: NewChatField,
  value: string | null,
  models: readonly PickableModel[],
  t: TFunction,
): string => {
  if (field === 'model') return value ? modelLabel(value, models) : t('agentPanel.model.default')

  if (field === 'effort') {
    const level = effortLevelOf(value)

    return level ? t(`agentPanel.effort.levels.${level}`) : t('agentPanel.effort.default')
  }

  return t(
    `agentPanel.modes.labels.${PERMISSION_MODES.find((mode) => mode === value) ?? 'default'}`,
  )
}

/** Закреплённое значение поля; null - «как выбрано в последний раз». */
export const pinnedValue = (prefs: PanelPrefs, field: NewChatField): string | null => {
  if (field === 'model') return prefs.newTabModel
  if (field === 'effort') return prefs.newTabEffort

  return prefs.newTabMode
}

/**
 * Последний выбор - то, что у выбранной вкладки проекта: от неё новая и унаследует.
 * Без вкладки - режим «спрашивать», модель и усилие «как в CLI».
 */
export const lastPick = (conversation: Conversation | null, field: NewChatField): string | null => {
  if (field === 'model') return conversation?.model ?? null
  if (field === 'effort') return conversation?.effort ?? null

  return conversation?.permissionMode ?? 'default'
}

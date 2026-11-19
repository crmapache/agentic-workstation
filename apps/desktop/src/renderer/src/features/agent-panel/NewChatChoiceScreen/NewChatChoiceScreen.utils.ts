import type { TFunction } from 'i18next'

import type { EffortLevel, PermissionMode } from '@shared/conversation'
import { effortLevelOf, PERMISSION_MODES } from '@shared/conversation'
import type { PanelPrefsPatch } from '@shared/panel-prefs'

import type { PickableModel } from '../models.types'
import type { NewChatField } from '../NewChatScreen/NewChatScreen.types'
import type { NewChatChoice } from './NewChatChoiceScreen.types'

/** Из чего выбирать усилие и режим новой вкладки - у провайдера панели. */
export type NewChatOptions = {
  /** Уровни модели новой вкладки, сильнейший первым (как в меню под полем). */
  efforts: readonly EffortLevel[]
  modes: readonly PermissionMode[]
  /** Без вопросов - только если ни один слой настроек его не запретил. */
  bypassAllowed: boolean
}

/**
 * Варианты поля после «как выбрано в последний раз»: модели - те же, что в MODEL под
 * полем (и свои); усилие - уровни модели у провайдера, от слабого; режим - режимы
 * провайдера по правилам CLI для новой вкладки.
 */
export const newChatChoices = (
  field: NewChatField,
  models: readonly PickableModel[],
  options: NewChatOptions,
  t: TFunction,
): NewChatChoice[] => {
  if (field === 'model') {
    return models.map((model) => ({
      value: model.value,
      label: model.displayName,
      description: model.custom ? t('agentPanel.newChats.custom') : model.description || undefined,
    }))
  }

  if (field === 'effort') {
    return options.efforts.toReversed().map((level) => ({
      value: level,
      label: t(`agentPanel.effort.levels.${level}`),
      description: t(`agentPanel.effort.hints.${level}`),
    }))
  }

  return options.modes
    .filter((mode) => options.bypassAllowed || mode !== 'bypassPermissions')
    .map((mode) => ({
      value: mode,
      label: t(`agentPanel.modes.labels.${mode}`),
      description: t(`agentPanel.modes.hints.${mode}`),
    }))
}

/** Изменение настроек для выбора; null - «как выбрано в последний раз». */
export const pinPatch = (field: NewChatField, value: string | null): PanelPrefsPatch => {
  if (field === 'model') return { newTabModel: value }
  if (field === 'effort') return { newTabEffort: effortLevelOf(value) }

  return { newTabMode: PERMISSION_MODES.find((mode) => mode === value) ?? null }
}

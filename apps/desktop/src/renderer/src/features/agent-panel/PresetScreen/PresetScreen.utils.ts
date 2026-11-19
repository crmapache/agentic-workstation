import type { TFunction } from 'i18next'

import type { ChoiceOption } from '@agentic-workstation/ui/ChoiceField.types'

import type { PickableModel } from '../models.types'
import { newChatChoices } from '../NewChatChoiceScreen/NewChatChoiceScreen.utils'
import type { NewChatOptions } from '../NewChatChoiceScreen/NewChatChoiceScreen.utils'

/**
 * Варианты полей пресета - те же, что у новых вкладок (модели меню и свои, уровни модели от
 * слабого, режимы провайдера), а у модели и усилия первым - «по умолчанию» (пусто): пресет
 * может и не трогать выбор CLI. Режим без вопросов не прячется: пресет - на машину, а не на
 * проект; где режим запрещён, кнопка его просто не поставит.
 */
export const presetChoices = (
  models: readonly PickableModel[],
  options: Omit<NewChatOptions, 'bypassAllowed'>,
  t: TFunction,
): { model: ChoiceOption[]; effort: ChoiceOption[]; mode: ChoiceOption[] } => {
  const all = { ...options, bypassAllowed: true }

  return {
    model: [
      {
        value: '',
        label: t('agentPanel.model.default'),
        description: t('agentPanel.model.defaultHint'),
      },
      ...newChatChoices('model', models, all, t),
    ],
    effort: [
      {
        value: '',
        label: t('agentPanel.effort.default'),
        description: t('agentPanel.effort.defaultHint'),
      },
      ...newChatChoices('effort', models, all, t),
    ],
    mode: newChatChoices('mode', models, all, t),
  }
}

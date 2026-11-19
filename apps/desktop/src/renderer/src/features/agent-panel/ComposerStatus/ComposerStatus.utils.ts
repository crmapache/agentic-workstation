import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'

import type { Conversation } from '@shared/conversation'

import type { ModelChip } from '../model-chip.types'
import { modelFamily } from '../model-chip.utils'
import type { PickableModel } from '../models.types'
import { formatTokens } from '../panel.utils'
import {
  MODEL_ICONS,
  SETUP_SECTIONS,
  SETUP_SEPARATOR,
  OTHER_MODEL_ICON,
} from './ComposerStatus.constants'
import type { SetupFlow, SetupSection } from './ComposerStatus.types'

/** Иконка модели в разделе Model: по семье, у модели без семьи Claude - общая. */
export const modelIcon = (model: string): LucideIcon => {
  const family = modelFamily(model)

  return family ? MODEL_ICONS[family] : OTHER_MODEL_ICON
}

/** Соседний раздел панели индикатора по кругу: шаг -1 - влево, 1 - вправо. */
export const nextSection = (section: SetupSection, step: 1 | -1): SetupSection => {
  const count = SETUP_SECTIONS.length

  return SETUP_SECTIONS[(SETUP_SECTIONS.indexOf(section) + step + count) % count] ?? section
}

/**
 * Куда ведёт выбор в разделе: идём шагами от открытия - в следующий раздел, последний шаг и
 * раздел, открытый человеком самим, - никуда, панель закрывается.
 */
export const stepAfterPick = ({ section, guided }: SetupFlow): SetupSection | null => {
  const next = SETUP_SECTIONS[SETUP_SECTIONS.indexOf(section) + 1]

  return guided && next ? next : null
}

/**
 * Части значения индикатора словами: «Opus 5.5», «High», «Bypass» - на самом индикаторе
 * коротко, без «effort» и «permissions», которые ясны по месту. «По умолчанию» называется
 * с тем, что по умолчанию, - иначе в строке стояли бы два одинаковых «Default».
 * label - всё одной строкой для скринридера, hint - подсказка над индикатором: там слова
 * полные, «High effort» и «Bypass permissions», потому что вне строки место не подсказывает.
 */
export const setupValue = (conversation: Conversation, chip: ModelChip, t: TFunction) => {
  const model =
    conversation.model === null && !chip.warning ? t('agentPanel.status.defaultModel') : chip.label

  const level = conversation.effort && t(`agentPanel.effort.levels.${conversation.effort}`)
  const effort = level || t('agentPanel.effort.default')
  const effortInFull = level ? t('agentPanel.status.effortValue', { value: level }) : effort

  const mode = t(`agentPanel.modes.short.${conversation.permissionMode}`)
  const modeInFull = t(`agentPanel.modes.labels.${conversation.permissionMode}`)

  return {
    model,
    effort,
    mode,
    label: [model, effortInFull, modeInFull].join(SETUP_SEPARATOR),
    hint: [
      chip.hint,
      t('agentPanel.status.effortHint', { value: effort }),
      t('agentPanel.status.modeHint', { value: modeInFull }),
    ].join(SETUP_SEPARATOR),
  }
}

/** Модели подключений группами: по id подключения (имена у двух ключей могут совпасть). */
export const modelGroups = (
  models: readonly PickableModel[],
): { id: string; label: string; models: PickableModel[] }[] => {
  const groups = new Map<string, { id: string; label: string; models: PickableModel[] }>()

  for (const model of models) {
    const group = model.group ?? { id: '', label: model.description }
    const known = groups.get(group.id)

    if (known) known.models.push(model)
    else groups.set(group.id, { ...group, models: [model] })
  }

  return [...groups.values()]
}

/** Подпись модели подключения: окно контекста, у тесного - предупреждение. */
export const contextCaption = (model: PickableModel, t: TFunction): string | undefined => {
  if (model.contextWindow === undefined) return undefined

  const tokens = formatTokens(model.contextWindow)

  return model.smallContext
    ? t('openModels.menu.smallContext', { tokens })
    : t('openModels.menu.context', { tokens })
}

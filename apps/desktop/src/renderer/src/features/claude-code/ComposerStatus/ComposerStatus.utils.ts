import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'

import type { Conversation } from '@shared/claude'

import type { ModelChip } from '../model-chip.types'
import { modelFamily } from '../model-chip.utils'
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
    conversation.model === null && !chip.warning ? t('claudeCode.status.defaultModel') : chip.label

  const level = conversation.effort && t(`claudeCode.effort.levels.${conversation.effort}`)
  const effort = level || t('claudeCode.effort.default')
  const effortInFull = level ? t('claudeCode.status.effortValue', { value: level }) : effort

  const mode = t(`claudeCode.modes.short.${conversation.permissionMode}`)
  const modeInFull = t(`claudeCode.modes.labels.${conversation.permissionMode}`)

  return {
    model,
    effort,
    mode,
    label: [model, effortInFull, modeInFull].join(SETUP_SEPARATOR),
    hint: [
      chip.hint,
      t('claudeCode.status.effortHint', { value: effort }),
      t('claudeCode.status.modeHint', { value: modeInFull }),
    ].join(SETUP_SEPARATOR),
  }
}

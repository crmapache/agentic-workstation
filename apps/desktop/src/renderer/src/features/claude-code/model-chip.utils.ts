import type { TFunction } from 'i18next'

import type { Conversation } from '@shared/claude'
import { fastModeShown } from '@shared/claude-fast-mode'
import type { PanelModelFamily } from '@shared/claude-models'
import { modelLabelOf, modelFamilyOf, PANEL_MODEL_FAMILIES } from '@shared/claude-models'

import { fastChipHint } from './fast-mode.utils'
import type { ModelChip } from './model-chip.types'
import type { PickableModel } from './models.types'

/**
 * Семья модели для панели («opus», «claude-opus-4-8», «sonnet[1m]») - из тех, что панель знает
 * (иконка, порядок меню). Своя модель через прокси и модель чужого провайдера - undefined.
 */
export const modelFamily = (model: string): PanelModelFamily | undefined =>
  modelFamilyOf(model, PANEL_MODEL_FAMILIES)

/**
 * Имя модели для людей: из каталога - его подпись, иначе из идентификатора
 * («claude-opus-4-8» - «Opus 4.8», «[1m]» - «1M», дата сборки не нужна).
 */
export const modelCaption = (model: string, models: readonly PickableModel[]): string => {
  const known = models.find((option) => option.value === model || option.resolved === model)

  return known ? known.displayName : modelLabelOf(model, modelFamily(model))
}

/**
 * Чип MODEL (как в ACC): держит ВЫБОР («1M» не слетает от подписи без метки окна), а
 * когда выбор не доехал или CLI сменил модель сам - называет работающую модель жёлтым,
 * подсказка говорит, что случилось. ↯ - быстрый режим: горит, ждёт или недоступен.
 */
export const modelChip = (
  conversation: Conversation,
  models: readonly PickableModel[],
  t: TFunction,
): ModelChip => {
  const picked = models.find((model) => model.value === conversation.model)
  const pickLabel = picked?.displayName ?? conversation.model ?? t('claudeCode.model.default')
  const note = conversation.modelNote
  const running = conversation.activeModel
  const fast = fastModeShown(conversation.fastMode, conversation.fastReport)
  const fastHint = fastChipHint(fast, t)
  const fastMark =
    fast.kind === 'off'
      ? null
      : fast.kind === 'on'
        ? 'on'
        : fast.kind === 'waiting'
          ? 'dim'
          : 'warning'
  const withFast = (hint: string) => (fastHint ? `${hint} · ${fastHint}` : hint)

  if (!note || !running) {
    return {
      label: pickLabel,
      warning: false,
      hint: withFast(t('claudeCode.status.modelHint', { value: pickLabel })),
      fast: fastMark,
    }
  }

  const label = modelCaption(running, models)
  const hint =
    note.kind === 'swapped'
      ? t('claudeCode.modelNote.switchedHint', {
          model: label,
          from: modelCaption(note.from, models),
        })
      : t('claudeCode.modelNote.stuckHint', {
          model: label,
          picked: modelCaption(note.picked, models),
        })

  return { label, warning: true, hint: withFast(hint), fast: fastMark }
}

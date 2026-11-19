import type { ParseKeys } from 'i18next'

import type { RewindScope, RewindPreview, RewindRefusal } from '@shared/rewind'

/** Что вернуть - три варианта терминального /rewind, по порядку ACC. */
export const REWIND_CHOICES: { scope: RewindScope; labelKey: ParseKeys }[] = [
  { scope: 'conversation', labelKey: 'agentPanel.rewind.conversation' },
  { scope: 'code', labelKey: 'agentPanel.rewind.code' },
  { scope: 'both', labelKey: 'agentPanel.rewind.both' },
]

/** Сколько файлов диалог называет до «and N more»: горстка читается с ходу, сорок - нет. */
export const FILES_SHOWN = 5

/** Почему кода нет - словами диалога (состояние предпросмотра или подробность отказа code). */
export const CODE_STATE_KEYS: Record<
  Exclude<RewindPreview['state'], 'ready' | 'unavailable'>,
  ParseKeys
> = {
  none: 'agentPanel.rewind.none',
  off: 'agentPanel.rewind.off',
  notTracked: 'agentPanel.rewind.notTracked',
  noCheckpoint: 'agentPanel.rewind.noCheckpoint',
  changedSince: 'agentPanel.rewind.changedSince',
  outsideProject: 'agentPanel.rewind.outsideProject',
}

/** Отказы, у которых свои слова; code и other собираются с подробностью. */
export const REFUSAL_KEYS: Record<Exclude<RewindRefusal, 'code' | 'other'>, ParseKeys> = {
  busy: 'agentPanel.rewind.refused.busy',
  gone: 'agentPanel.rewind.refused.gone',
  moved: 'agentPanel.rewind.refused.moved',
  midCall: 'agentPanel.rewind.refused.midCall',
  notSaved: 'agentPanel.rewind.refused.notSaved',
  unsupported: 'agentPanel.rewind.refused.unsupported',
  noProcess: 'agentPanel.rewind.refused.noProcess',
  ended: 'agentPanel.rewind.refused.ended',
}

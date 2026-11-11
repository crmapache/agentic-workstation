import type { TFunction } from 'i18next'

import type { QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'

/** Ответы на вопросы сценария одной строкой: «what: src, depth: 2». */
export const inputsText = (inputs: Record<string, string>, limit = 160): string => {
  const line = Object.entries(inputs)
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `${key}: ${value.replace(/\s+/g, ' ')}`)
    .join(', ')

  return line.length > limit ? `${line.slice(0, limit)}…` : line
}

/** Строка элемента под именем сценария: ответы на вопросы и почему не начался, если не начался. */
export const itemFacts = (t: TFunction, item: QueueItemWire): string =>
  [inputsText(item.inputs), item.refusal && t('queue.refused', { code: item.refusal })]
    .filter(Boolean)
    .join(' · ')

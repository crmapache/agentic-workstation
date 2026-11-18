import type { TFunction } from 'i18next'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'

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

/**
 * Очередь встала на несделанном (упал, остановлен), а за ним ждут: Resume в IDE не пропускает его,
 * а продолжает его прогон с места (ADR 0082) - кнопка так и называется.
 */
export const holdCarriesOn = (queue: QueueWire): boolean => {
  const held = queue.hold && queue.items.find((item) => item.id === queue.hold?.itemId)

  return (
    (held?.state === 'failed' || held?.state === 'stopped') &&
    queue.items.some((item) => item.state === 'waiting')
  )
}

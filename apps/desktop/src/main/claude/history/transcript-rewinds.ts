import type { CliMessage } from '../cli/cli-messages'
import { stringField, parseCliLine } from '../cli/cli-messages'

/** Строки самой цепочки разговора: их откат и отрезает. Имена, очередь, копии - нет. */
const CHAIN_TYPES = new Set(['user', 'assistant', 'attachment', 'system', 'progress'])

/**
 * Что откату нужно знать о строке - без её содержимого: так отрезанное считается и по
 * транскрипту в гигабайт, не держа его в памяти (форк, поиск).
 */
export type ChainInfo = {
  uuid: string
  parentUuid: string
  isChain: boolean
  rewoundLeaf: string | null
}

/** Сведения о разобранной строке; не разобралась - строка вне цепочки. */
export const chainInfoOf = (message: CliMessage | null): ChainInfo => {
  if (!message) return { uuid: '', parentUuid: '', isChain: false, rewoundLeaf: null }

  const isMarker = message.type === 'last-prompt' && message['rewound'] === true

  return {
    uuid: stringField(message, 'uuid'),
    parentUuid: stringField(message, 'parentUuid'),
    isChain: CHAIN_TYPES.has(message.type) && stringField(message, 'uuid') !== '',
    rewoundLeaf: isMarker ? stringField(message, 'leafUuid') : null,
  }
}

/**
 * Номера строк, которые отрезал откат. CLI файл не переписывает: после отката он
 * дописывает `last-prompt` с `rewound: true`, а следующее сообщение цепляет к строке перед
 * отрезанным. Отрезанное - строки цепочки между этой строкой (точкой, с которой разговор
 * продолжился) и меткой. Читать файл по цепочке, как CLI, нельзя: параллельные вызовы
 * отвечают ветками, и законные строки оказались бы вне неё. Точки нет в прочитанном куске
 * (хвост длинного файла) - уходит всё до метки. Пустая точка - откат к первому сообщению:
 * отрезана вся цепочка до метки (строки без имени - снимки файлов, заголовок - точкой не
 * считаются).
 */
export const rewoundIndices = (infos: readonly ChainInfo[]): Set<number> => {
  const dropped = new Set<number>()

  for (const [markerIndex, marker] of infos.entries()) {
    if (marker.rewoundLeaf === null) continue

    const next = infos.slice(markerIndex + 1).find((info) => info.isChain)
    const anchor = next ? next.parentUuid : marker.rewoundLeaf
    let start = anchor ? markerIndex - 1 : -1

    while (start >= 0 && (infos[start]?.uuid !== anchor || dropped.has(start))) start -= 1

    for (let index = start + 1; index < markerIndex; index += 1) {
      if (infos[index]?.isChain) dropped.add(index)
    }
  }

  return dropped
}

/** Строки транскрипта без того, что отрезал откат (как - rewoundIndices). */
export const dropRewound = (lines: readonly string[]): string[] => {
  if (!lines.some((line) => line.includes('"rewound":true'))) return [...lines]

  const dropped = rewoundIndices(lines.map((line) => chainInfoOf(parseCliLine(line))))

  return lines.filter((_line, index) => !dropped.has(index))
}

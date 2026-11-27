import type { CliMessage } from '../cli/cli-messages'
import { recordField, stringField, parseCliLine } from '../cli/cli-messages'
import type { ChainInfo } from './transcript-rewinds'
import { chainInfoOf, rewoundIndices } from './transcript-rewinds'

/**
 * Что форку нужно знать о строке транскрипта - без её содержимого: транскрипт с
 * картинками бывает в гигабайт, а точке форка хватает имён и цепочки. cuttable - CLI
 * согласен резать на ней; names - имена, под которыми её ищут.
 */
export type ForkLine = ChainInfo & { cuttable: boolean; names: readonly string[] }

/**
 * Строки, на которых CLI соглашается резать форк (`--resume-session-at`), замер ACC на
 * 2.1.280: ответ, вызов и результат, вложение, stop_hook_summary. На прочей строке
 * процесс умирает с «No message found».
 */
const isCuttable = (message: CliMessage) =>
  message['isSidechain'] !== true &&
  stringField(message, 'uuid') !== '' &&
  (message.type === 'assistant' ||
    message.type === 'user' ||
    message.type === 'attachment' ||
    (message.type === 'system' && message.subtype === 'stop_hook_summary'))

/**
 * Имена строки: своё и, у сообщения, написанного посреди хода, - вложение очереди, в
 * котором CLI хранит его под нашим uuid (`attachment.source_uuid`).
 */
const namesOf = (message: CliMessage): string[] => {
  const own = stringField(message, 'uuid')
  const queued = stringField(recordField(message, 'attachment'), 'source_uuid')

  return queued ? [own, queued] : [own]
}

/** Сведения о строке транскрипта для форка: разбор один раз, содержимое не держится. */
export const forkLineOf = (line: string): ForkLine => {
  const message = parseCliLine(line)

  return {
    ...chainInfoOf(message),
    cuttable: message !== null && isCuttable(message),
    names: message ? namesOf(message) : [],
  }
}

/**
 * Строки, которые несёт разговор: без отрезанного откатом. upTo - только до строки с этим
 * именем включительно (всё, что несёт нерождённый форк); её нет (источник откатили за неё)
 * - нести нечего.
 */
export const forkChain = (lines: readonly ForkLine[], upTo: string | null = null): ForkLine[] => {
  const dropped = rewoundIndices(lines)
  const kept = lines.filter((_line, index) => !dropped.has(index))

  if (upTo === null) return kept

  const end = kept.findIndex((line) => line.uuid === upTo)

  return end === -1 ? [] : kept.slice(0, end + 1)
}

/**
 * Где резать форк перед сообщением человека. at - строка, до которой форк несёт
 * разговор (включительно); start - сообщение первое, нести нечего; missing - такого
 * сообщения в транскрипте нет (или нет строки над ним, которую CLI примет).
 */
export type ForkAnchor = { kind: 'at'; uuid: string } | { kind: 'start' } | { kind: 'missing' }

/** Последняя строка цепочки, которую CLI примет: форк всего разговора. null - нести нечего. */
export const forkLeaf = (lines: readonly ForkLine[]): string | null =>
  lines.findLast((line) => line.cuttable)?.uuid ?? null

/**
 * Точка форка перед сообщением beforeUuid: его родитель и дальше вверх по цепочке,
 * пока не найдётся строка, которую CLI примет.
 */
export const forkAnchor = (lines: readonly ForkLine[], beforeUuid: string): ForkAnchor => {
  const byUuid = new Map(lines.map((line) => [line.uuid, line]))
  const target = lines.find((line) => line.names.includes(beforeUuid))

  if (!target) return { kind: 'missing' }

  const seen = new Set<string>()
  let current = target.parentUuid

  if (!current) return { kind: 'start' }

  while (current && !seen.has(current)) {
    seen.add(current)

    const line = byUuid.get(current)

    if (!line) return { kind: 'missing' }
    if (line.cuttable) return { kind: 'at', uuid: current }

    current = line.parentUuid
  }

  // Выше сообщения - только строки, на которых CLI не режет: нести нечего.
  return { kind: 'start' }
}

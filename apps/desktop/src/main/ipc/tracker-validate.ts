import type { TrackerOp, TrackerOpKind, TrackerSendRequest } from '@shared/tracker'

import { parseHours, parseTarget } from './scenarios-validate'
import { assertString } from './validate'

/**
 * Разбор правок трекера из окна: форма правки и типы id. Поля карточки (срок, приоритет,
 * сценарий) проверяет сама правка (tracker-fields.ts) - там же, где правки от модели.
 */

const OP_KINDS: readonly TrackerOpKind[] = [
  'project.create',
  'project.update',
  'project.move',
  'project.archive',
  'project.restore',
  'project.purge',
  'flow.create',
  'flow.update',
  'flow.move',
  'flow.delete',
  'group.create',
  'group.update',
  'group.move',
  'group.delete',
  'card.create',
  'card.update',
  'card.move',
  'card.delete',
  'undelete',
]

/** Поля со строкой-id: должны быть строкой, если есть. */
const ID_FIELDS = ['id', 'projectId', 'flowId', 'groupId'] as const
/** Поля «место»: строка или null. */
const PLACE_FIELDS = ['beforeId', 'followUpOf'] as const
/** Поля текста: строка, если есть. */
const TEXT_FIELDS = ['title', 'subtitle', 'description'] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseTrackerOp = (value: unknown): TrackerOp => {
  if (!isObject(value) || !(OP_KINDS as readonly unknown[]).includes(value.kind))
    throw new Error('Недопустимая правка трекера')

  for (const name of ID_FIELDS) {
    if (value[name] !== undefined) assertString(value[name], name)
  }

  for (const name of PLACE_FIELDS) {
    if (value[name] !== undefined && value[name] !== null) assertString(value[name], name)
  }

  for (const name of TEXT_FIELDS) {
    if (value[name] !== undefined) assertString(value[name], name)
  }

  if (value.fields !== undefined && !isObject(value.fields))
    throw new Error('Поля карточки - не объект')

  if (value.kind === 'undelete') {
    if (!Array.isArray(value.ids) || value.ids.some((id) => typeof id !== 'string'))
      throw new Error('ids - не список строк')
  }

  return value as TrackerOp
}

export const parseSendRequest = (value: unknown): TrackerSendRequest => {
  if (!isObject(value) || !isObject(value.source)) throw new Error('Что отправить - не указано')

  const { source } = value
  const target = parseTarget(value.target)
  const hours = value.hours === undefined ? null : parseHours(value.hours)

  if (source.kind === 'group') {
    assertString(source.groupId, 'groupId')

    return { source: { kind: 'group', groupId: source.groupId }, target, hours }
  }

  assertString(source.cardId, 'cardId')

  return { source: { kind: 'card', cardId: source.cardId }, target, hours }
}

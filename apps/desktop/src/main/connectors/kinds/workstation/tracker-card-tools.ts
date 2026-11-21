import type { TrackerOp, TrackerCardFields } from '@shared/tracker'

import { stringArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import { cardFieldsOf, TrackerError } from '../../../tracker/tracker-fields'
import type { TrackerPlace } from '../../../tracker/tracker-spaces'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import {
  noMove,
  textArg,
  savedView,
  checkBefore,
  cardFieldsArg,
  checkBindings,
  trackerPlaceOf,
  CARD_FIELDS_SCHEMA,
} from './tracker-args'
import { slotOrder } from './tracker-views'
import { PROJECT_ARG } from './workstation-args'
import { trackerError } from './workstation-words'

type NewCard = Partial<TrackerCardFields> & { title: string }

type Planned = { fields: NewCard; followUps: { fields: NewCard; where: string }[]; where: string }

type Made = { id: string; follow_ups?: string[] }

/** Карточек за один вызов: пачка из разговора, а не перенос целой доски. */
const BATCH_MAX = 100

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Отказ разбора - с тем, какая карточка пачки не прошла. */
const at = <T>(where: string, read: () => T): T => {
  try {
    return read()
  } catch (error) {
    if (error instanceof ArgumentError) throw new ArgumentError(`${where}: ${error.message}`)
    if (error instanceof TrackerError) throw trackerError(error.code, where)

    throw error
  }
}

/**
 * Карточка пачки: разобрана и проверена той же проверкой, что у правки трекера, - отказ по
 * сроку или длине виден до первой созданной карточки.
 */
const plannedCard = (value: unknown, where: string): NewCard =>
  at(where, () => {
    if (!isRecord(value)) throw new ArgumentError('a card is an object')

    const fields = { ...cardFieldsArg(value), title: textArg(value, 'title') ?? '' }

    cardFieldsOf(fields)

    return fields
  })

const planOf = (args: Record<string, unknown>): Planned[] => {
  const cards = args['cards']

  if (!Array.isArray(cards) || cards.length === 0)
    throw new ArgumentError('"cards" is a list of cards, at least one')

  const planned = cards.map((card: unknown, index): Planned => {
    const where = `cards[${index}]`
    const fields = plannedCard(card, where)
    const raw = isRecord(card) ? card['follow_ups'] : undefined

    if (raw !== undefined && !Array.isArray(raw))
      throw new ArgumentError(`${where}.follow_ups is a list of cards`)

    const followUps = (raw ?? []).map((one: unknown, step) => {
      const spot = `${where}.follow_ups[${step}]`

      if (isRecord(one) && one['follow_ups'] !== undefined)
        throw new ArgumentError(`${spot}: follow-ups do not nest - list them all in one follow_ups`)

      return { fields: plannedCard(one, spot), where: spot }
    })

    return { fields, followUps, where }
  })
  const total = planned.reduce((sum, card) => sum + 1 + card.followUps.length, 0)

  if (total > BATCH_MAX)
    throw new ArgumentError(`Up to ${BATCH_MAX} cards a call (follow-ups count): split the list.`)

  return planned
}

/** Сценарии всех карточек пачки - до первой созданной: отказ называет карточку. */
const checkPlanned = async (ports: WorkstationPorts, projectPath: string, planned: Planned[]) => {
  for (const one of planned.flatMap((card) => [card, ...card.followUps])) {
    try {
      await checkBindings(ports, projectPath, [one.fields.scenario])
    } catch (error) {
      if (error instanceof ArgumentError) throw new ArgumentError(`${one.where}: ${error.message}`)

      throw error
    }
  }
}

/** Создать по плану; доска отказала посреди - словами, что не прошло и что уже легло. */
const createAll = async (
  ports: WorkstationPorts,
  place: TrackerPlace,
  groupId: string,
  planned: Planned[],
): Promise<Made[]> => {
  const made: Made[] = []
  const make = async (op: TrackerOp, where: string) => {
    const outcome = await ports.tracker.apply(place, op)

    if (outcome.ok && outcome.created) return outcome.created

    const words = trackerError(outcome.ok ? 'notFound' : outcome.code, where).message
    const kept = made.length > 0 ? JSON.stringify(made) : 'nothing'

    throw new ArgumentError(`${words} Stopped there. Made before it (kept on the board): ${kept}.`)
  }

  for (const card of planned) {
    const task: Made = {
      id: await make({ kind: 'card.create', groupId, fields: card.fields }, card.where),
    }

    made.push(task)

    for (const followUp of card.followUps) {
      const id = await make(
        { kind: 'card.create', groupId: '', followUpOf: task.id, fields: followUp.fields },
        followUp.where,
      )

      task.follow_ups = [...(task.follow_ups ?? []), id]
    }
  }

  return made
}

/** Карточки трекера: одна - создать или править, пачка - из разговора на доску. */
export const TRACKER_CARD_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'tracker_save_card',
    description: [
      'Create a card or change one (id: give only what changes; to move it use tracker_move).',
      'A new card is a task at the end of a group (group_id) or a follow-up at the end of a task chain (follow_up_of: the task or any of its follow-ups); before_id puts it before that card instead.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        id: { type: 'string', description: 'The card to change. Without it a new one is made.' },
        group_id: { type: 'string' },
        follow_up_of: { type: 'string' },
        before_id: { type: 'string' },
        ...CARD_FIELDS_SCHEMA,
      },
    },
    run: async (args, ports, call) => {
      const place = trackerPlaceOf(args, call, ports)
      const id = stringArg(args, 'id')
      const fields = cardFieldsArg(args)

      if (id) noMove(args, ['group_id', 'follow_up_of', 'before_id'])

      await checkBindings(ports, place.rootPath, [fields.scenario])

      if (id) return savedView(args, call, ports, { kind: 'card.update', id, fields })

      const groupId = stringArg(args, 'group_id')
      const followUpOf = stringArg(args, 'follow_up_of')
      const beforeId = stringArg(args, 'before_id') ?? null

      if (Boolean(groupId) === Boolean(followUpOf))
        throw new ArgumentError(
          'A new card needs group_id (a task of that group) or follow_up_of (a follow-up in that task chain) - one of them.',
        )

      if (beforeId) {
        checkBefore(
          await ports.tracker.board(place),
          beforeId,
          followUpOf
            ? { kind: 'followUp', cardId: followUpOf }
            : { kind: 'task', parentId: groupId ?? '' },
        )
      }

      return savedView(args, call, ports, {
        kind: 'card.create',
        groupId: groupId ?? '',
        followUpOf: followUpOf ?? null,
        beforeId,
        fields: { ...fields, title: fields.title ?? '' },
      })
    },
  },
  {
    name: 'tracker_add_cards',
    description: [
      'Add tasks to the end of a group in one call, each with its follow-ups: the way to turn a plan agreed in the chat into cards.',
      'Then send the group to a queue (tracker_send_to_queue) if its cards have scenarios.',
      'Every card is checked before the first one is made; if the board still refuses one, it stops there and says which and what was made.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        group_id: { type: 'string' },
        cards: {
          type: 'array',
          description: `Tasks in order, up to ${BATCH_MAX} cards with follow-ups.`,
          items: {
            type: 'object',
            properties: {
              ...CARD_FIELDS_SCHEMA,
              follow_ups: {
                type: 'array',
                description: 'Cards that come after this task, in order. Same fields, no nesting.',
                items: { type: 'object', properties: CARD_FIELDS_SCHEMA, required: ['title'] },
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['group_id', 'cards'],
    },
    run: async (args, ports, call) => {
      const place = trackerPlaceOf(args, call, ports)
      const groupId = stringArg(args, 'group_id', true)
      const planned = planOf(args)

      if (!slotOrder(await ports.tracker.board(place), { kind: 'task', parentId: groupId }))
        throw trackerError('notFound', 'group_id')

      await checkPlanned(ports, place.rootPath, planned)

      return { group_id: groupId, created: await createAll(ports, place, groupId, planned) }
    },
  },
]

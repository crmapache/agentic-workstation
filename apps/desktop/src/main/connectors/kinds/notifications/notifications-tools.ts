import { stringArg, booleanArg, NativeSource, ArgumentError } from '../native-tools'
import type { NativeCall, NativeTool } from '../native-tools'
import type { InboxLink, AgentCaller } from '../../../inbox/inbox-agent'
import { NoticeError } from '../../../inbox/inbox-notice'
import type { NoticeButton } from '../../../inbox/inbox-notice'

const BUTTON_TYPES = ['reply', 'open', 'dismiss'] as const

/** Кто зовёт: без процесса разговора (вызов не через шлюз) уведомлению не от чьего имени прийти. */
const callerOf = (call: NativeCall): AgentCaller => {
  if (!call.launch) throw new ArgumentError('Notifications need a conversation of the IDE.')

  return { projectPath: call.launch.projectPath, conversationId: call.launch.conversationId }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const buttonsArg = (args: Record<string, unknown>): NoticeButton[] => {
  const value = args['buttons']

  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ArgumentError('"buttons" must be a list')

  return value.map((raw) => {
    if (!isRecord(raw)) throw new ArgumentError('every button is an object with label and type')

    const type = BUTTON_TYPES.find((one) => one === raw['type'])

    if (!type) throw new ArgumentError('button "type" is reply, open or dismiss')

    return {
      label: typeof raw['label'] === 'string' ? raw['label'] : '',
      type,
      value: typeof raw['value'] === 'string' ? raw['value'] : '',
    }
  })
}

/**
 * Инструменты уведомлений IDE (ADR 0069). Уведомление - самому человеку, а не людям: ступень
 * write, не outbound. notify возвращается сразу: нажатие кнопки reply придёт в разговор
 * отдельным сообщением, вызов его не ждёт - часы напоминания держали бы ход занятым.
 */
export const NOTIFICATION_TOOLS: NativeTool<InboxLink>[] = [
  {
    name: 'notify',
    description: [
      "Put a notification into the person's Agentic Workstation notifications, optionally with buttons, now or at a later time (a reminder).",
      'Button types: reply - when pressed, a message comes back into this conversation saying which button they pressed (value: extra words to send with it); open - opens value, an http(s) link or an absolute file or folder path on their computer; dismiss - just closes it.',
      'Use it for results they should act on, reminders and choices. For a question the work cannot go on without, AskUserQuestion is better: it waits for the answer.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One short line.' },
        body: { type: 'string', description: 'Details in Markdown. Optional.' },
        buttons: {
          type: 'array',
          description: 'Up to 4 buttons; the first is the main one.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Up to 40 characters.' },
              type: { type: 'string', enum: [...BUTTON_TYPES] },
              value: { type: 'string', description: 'Link or path for open; words for reply.' },
            },
            required: ['label', 'type'],
          },
        },
        at: {
          type: 'string',
          description:
            'When to show it, ISO 8601: 2026-12-01T09:00 is local time of the person, an offset or Z is respected. Omit to show now.',
        },
        attention: {
          type: 'boolean',
          description: 'Needs their attention (highlighted). Default false.',
        },
      },
      required: ['title'],
    },
    run: (args, link, call) =>
      Promise.resolve(
        link.ready.post(callerOf(call), {
          title: stringArg(args, 'title', true),
          body: stringArg(args, 'body') ?? '',
          at: stringArg(args, 'at') ?? '',
          attention: booleanArg(args, 'attention', false),
          buttons: buttonsArg(args),
        }),
      ),
  },
  {
    name: 'list_notifications',
    description:
      'Notifications and reminders posted from this project: open, scheduled or done (with the button they pressed). Check before posting a reminder twice.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: (_args, link, call) => Promise.resolve(link.ready.list(callerOf(call))),
  },
  {
    name: 'cancel_notification',
    description:
      'Cancel a scheduled reminder or close an open notification posted from this project.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id from notify or list_notifications.' } },
      required: ['id'],
    },
    run: (args, link, call) =>
      Promise.resolve(link.ready.cancel(callerOf(call), stringArg(args, 'id', true))),
  },
]

export const createNotificationsSource = (link: InboxLink) =>
  new NativeSource(NOTIFICATION_TOOLS, link, [NoticeError])

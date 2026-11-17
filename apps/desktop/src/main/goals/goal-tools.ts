import type { GoalOutcome } from '@shared/goals'

import type { IdeServer } from '../connectors/gateway-host'
import { stringArg, NativeSource, ArgumentError } from '../connectors/kinds/native-tools'
import type { NativeCall, NativeTool } from '../connectors/kinds/native-tools'
import { JOURNAL_MAX } from './goal-parse'

/** Что инструменты поручения зовут у стола поручений; разговор - по сессии процесса. */
export type GoalToolsPort = {
  wait: (sessionId: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>
  journal: (sessionId: string, text: string) => string
  finish: (sessionId: string, outcome: GoalOutcome, report: string) => string
}

const sessionOf = (call: NativeCall): string => {
  const id = call.launch?.conversationId

  if (!id) throw new ArgumentError('These tools work only inside a goal of Agentic Workstation.')

  return id
}

const minutes = {
  type: 'number',
  description: 'How often to check, minutes.',
}

/**
 * Инструменты поручения (ADR 0080) - свой сервер IDE, который шлюз отдаёт только процессам
 * поручений. wait не ждёт сам: он записывает сон и возвращается сразу, процесс гаснет в конце
 * хода, а будит его IDE.
 */
export const GOAL_TOOLS: NativeTool<GoalToolsPort>[] = [
  {
    name: 'wait',
    description: [
      'Go to sleep until something happens; end your turn right after this call. Say what wakes you (one or more):',
      'watch - a read-only tool of a connector of this project that the IDE calls again and again without a model and compares the answer (for example read a mail thread or a Slack thread); give server (the MCP server name, like gmail-work), tool, args and expect - what change you wait for;',
      'look - a short check by a cheap model with web and read-only connector tools, for what one call cannot show (a page of a site);',
      'until - wake at this time no matter what (a deadline, "if no reply by Friday");',
      'person - you wait for the person to answer your notification or write to you.',
      'The first call of every watch runs now: a broken watch fails here, not in a week.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'One line for the person: what you wait for, like "Corey\'s reply about the call".',
        },
        watch: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              server: { type: 'string' },
              tool: { type: 'string' },
              args: { type: 'object' },
              expect: { type: 'string', description: 'What change counts as the event.' },
              every_minutes: {
                ...minutes,
                description: 'How often to check, minutes (2 or more, default 10).',
              },
            },
            required: ['server', 'tool', 'expect'],
          },
        },
        look: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instructions: { type: 'string', description: 'What to check and where.' },
              expect: { type: 'string' },
              every_minutes: {
                ...minutes,
                description: 'How often to check, minutes (15 or more, default 60).',
              },
            },
            required: ['instructions', 'expect'],
          },
        },
        until: {
          type: 'string',
          description:
            'ISO 8601 time: 2026-12-01T09:00 is the local time of the person, an offset or Z is respected.',
        },
        person: { type: 'boolean', description: 'You wait for the person.' },
      },
      required: ['reason'],
    },
    run: (args, port, call) => port.wait(sessionOf(call), args, call.signal),
  },
  {
    name: 'journal',
    description: `Replace the journal of the goal (Markdown, up to ${JOURNAL_MAX} characters): what is done, who you talked to, what was agreed, what is pending, ids of threads and messages. A later session may start from the goal and this journal only - keep it complete and short.`,
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    run: (args, port, call) =>
      Promise.resolve(port.journal(sessionOf(call), stringArg(args, 'text', true))),
  },
  {
    name: 'finish',
    description:
      'End the goal: outcome done - it is reached; failed - it cannot be reached (say why). The report goes to the person; end your turn right after this call.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['done', 'failed'] },
        report: { type: 'string', description: 'Short report in the language of the goal.' },
      },
      required: ['outcome', 'report'],
    },
    run: (args, port, call) => {
      const outcome = args['outcome']

      if (outcome !== 'done' && outcome !== 'failed') {
        throw new ArgumentError('"outcome" is done or failed')
      }

      return Promise.resolve(port.finish(sessionOf(call), outcome, stringArg(args, 'report', true)))
    },
  },
]

/** Пояснение сервера поручения - коротко: правила работы - в брифинге. */
export const GOAL_GUIDE =
  'Tools of the goal you are working on: wait (sleep until an event), journal (your notes for later sessions), finish (end the goal with a report).'

/**
 * Сервер поручения на шлюзе: только процессу, чей разговор - живое поручение (isGoal); чужому
 * процессу шлюз ответит, что такого сервера нет.
 */
export const goalServer = (
  port: GoalToolsPort,
  isGoal: (conversationId: string) => boolean,
): IdeServer => {
  const source = new NativeSource(GOAL_TOOLS, port, [ArgumentError])

  return (launch) => {
    const { conversationId } = launch

    if (!conversationId || !isGoal(conversationId)) return null

    return {
      instructions: () => GOAL_GUIDE,
      tools: async () => (await source.listTools()).map(({ access: _access, ...tool }) => tool),
      call: (name, args, signal) =>
        source.callTool(name, args, signal, {
          id: launch.id,
          projectPath: launch.projectPath,
          workDir: launch.workDir,
          conversationId,
        }),
    }
  }
}

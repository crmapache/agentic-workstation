import type { MarkPoint } from '@shared/walkthrough'

import { numberArg, stringArg, booleanArg, ToolOutput, NativeSource } from '../native-tools'
import type { NativeCall, NativeTool } from '../native-tools'
import { stepOf, deskCall, pointArg } from '../computer/computer-args'
import type { ComputerAgent } from '../../../computer/computer-agent'
import { ComputerError } from '../../../computer/computer-error'
import type { MarkOutcome, WalkthroughDesk } from '../../../walkthrough/walkthrough-desk'
import { userMarksOutput } from './walkthrough-user-marks'

/** Показ и Computer Use, на котором он стоит: подсветка ложится по его снимкам. */
export type WalkthroughApi = { desk: WalkthroughDesk; computer: ComputerAgent }

/** Ожидание шага человека по умолчанию и потолок: успеть сделать шаг, но не висеть вечно. */
const WAIT_DEFAULT_S = 120
const WAIT_MAX_S = 300

const BOX_PROPERTIES = {
  x0: { type: 'number', description: 'Left of the box, in pixels of your latest screenshot.' },
  y0: { type: 'number', description: 'Top of the box.' },
  x1: { type: 'number', description: 'Right of the box.' },
  y1: { type: 'number', description: 'Bottom of the box.' },
  say: {
    type: 'string',
    description:
      'One or two short spoken sentences about what is highlighted. Required: every highlight is explained out loud while it is on the screen.',
  },
  keep: {
    type: 'boolean',
    description:
      'Keep the highlights already on the screen and light this one too. Default: false - it replaces them.',
  },
} as const

const text = (value: string, isError = false) =>
  new ToolOutput({ content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) })

/** Разговор вызова: ключ Computer Use у разговора панели - id его вкладки. */
const conversationOf = (call: NativeCall): string => deskCall(call, stepOf({}, 'screenshot')).key

/** Вопрос, который синтез произнесёт вопросом: со знаком вопроса в конце, без точки перед ним. */
export const asQuestion = (raw: string): string => {
  const question = raw.trim().replace(/[.…!]+$/u, '')

  return /[?？]$/u.test(question) ? question : `${question}?`
}

/**
 * Ответ подсветки. Снимок не годится - свежий снимок и причина: модель смотрит заново, как при
 * отказе действия Computer Use (ADR 0129). Показа нет - словами.
 */
const answer = async (outcome: MarkOutcome, api: WalkthroughApi, call: NativeCall) => {
  if ('note' in outcome) return text(outcome.note)

  if (!outcome.look) return text(outcome.refusal, true)

  const shot = await api.computer.screenshot(deskCall(call, stepOf({}, 'screenshot')), null, 0)

  return new ToolOutput({
    content: [
      { type: 'image', data: shot.picture.data, mimeType: shot.picture.mimeType },
      {
        type: 'text',
        text: `${outcome.refusal} Nothing was highlighted: this screenshot shows the screen now, highlight again by it. ${shot.text}`,
      },
    ],
    isError: true,
  })
}

/**
 * Инструменты показа Walkthrough (ADR 0134, 0135). Все - без вопроса человеку: они подсвечивают
 * его экран, спрашивают его голосом, ждут его шага или кладут трубку звонка, который он сам начал,
 * и ничего в его данных не меняют. Действия на экране - инструменты Computer Use.
 */
export const WALKTHROUGH_TOOLS: NativeTool<WalkthroughApi>[] = [
  {
    name: 'highlight',
    description:
      'Show the user where to look: the screen dims everywhere but this box, and your say is spoken while it is lit. Give the box tight around the thing; the cutout adds its own margin. One highlight per thing: the next one waits until this say has been spoken. It appears when your earlier words have been spoken.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: BOX_PROPERTIES,
      required: ['x0', 'y0', 'x1', 'y1', 'say'],
    },
    run: async (args, api, call) => {
      const corners: [MarkPoint, MarkPoint] = [
        pointArg(args, 'x0', 'y0'),
        pointArg(args, 'x1', 'y1'),
      ]
      const say = stringArg(args, 'say', true)
      const keep = booleanArg(args, 'keep', false)

      return answer(await api.desk.highlight(conversationOf(call), corners, say, keep), api, call)
    },
  },
  {
    name: 'clear',
    description: 'Remove all highlights and marks once your earlier words have been spoken.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, api, call) => {
      const refusal = await api.desk.clear(conversationOf(call))

      return refusal ? text(refusal, true) : text('Marks will be removed after your earlier words.')
    },
  },
  {
    name: 'ask',
    description:
      'Ask the user a question out loud and wait for the answer: it is the only way to ask in a walkthrough, never end your turn on a question. Silence means yes and you go on; for a critical step (submit, send, buy, pay, delete) set critical: the question is asked twice, and silence ends the walkthrough.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'One short question, as you would say it.' },
        critical: {
          type: 'boolean',
          description: 'The step cannot be undone or affects others. Default: false.',
        },
      },
      required: ['question'],
    },
    run: async (args, api, call) => {
      const question = {
        text: asQuestion(stringArg(args, 'question', true)),
        critical: booleanArg(args, 'critical', false),
      }

      return text(await api.desk.ask(conversationOf(call), question, call.signal))
    },
  },
  {
    name: 'wait_for_user',
    description: `Practice: after you asked the user to do a step themselves, give them the mouse and wait until they do something and stop, say something, or ${WAIT_DEFAULT_S} s pass. Then check the screen with a Computer Use screenshot.`,
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: `How long to wait, 10 to ${WAIT_MAX_S}. Default: ${WAIT_DEFAULT_S}.`,
        },
      },
    },
    run: async (args, api, call) => {
      const seconds = numberArg(args, 'seconds', {
        min: 10,
        max: WAIT_MAX_S,
        fallback: WAIT_DEFAULT_S,
      })

      return text(await api.desk.waitForUser(conversationOf(call), seconds * 1000, call.signal))
    },
  },
  {
    name: 'user_marks',
    description:
      'See what the user drew on the screen with the walkthrough pens (circle, underline, arrow): a fresh screenshot, where each mark is in its pixels, and a close-up of what it points at.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: (_args, api, call) => userMarksOutput(api, call, conversationOf(call)),
  },
  {
    name: 'finish',
    description:
      'End the walkthrough: the voice call hangs up once your last words have been spoken, and the IDE comes back to this chat. Then write a short recap in the chat.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, api, call) => text(await api.desk.finish(conversationOf(call), call.signal)),
  },
]

/** Источник инструментов показа поверх Computer Use этой машины. */
export const createWalkthroughSource = (api: WalkthroughApi) =>
  new NativeSource(WALKTHROUGH_TOOLS, api, [ComputerError])

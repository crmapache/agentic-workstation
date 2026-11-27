import type { MarkPoint } from '@shared/walkthrough'

import { numberArg, booleanArg, ToolOutput, NativeSource } from '../native-tools'
import type { NativeCall, NativeTool } from '../native-tools'
import { stepOf, deskCall, pointArg } from '../computer/computer-args'
import type { ComputerAgent } from '../../../computer/computer-agent'
import { ComputerError } from '../../../computer/computer-error'
import type { MarkOutcome, WalkthroughDesk } from '../../../walkthrough/walkthrough-desk'
import type { MarkRequest } from '../../../walkthrough/walkthrough-marks'

/** Показ и Computer Use, на котором он стоит: метки ложатся по его снимкам. */
export type WalkthroughApi = { desk: WalkthroughDesk; computer: ComputerAgent }

/** Ожидание шага человека по умолчанию и потолок: успеть сделать шаг, но не висеть вечно. */
const WAIT_DEFAULT_S = 120
const WAIT_MAX_S = 300

const BOX_PROPERTIES = {
  x0: { type: 'number', description: 'Left of the box, in pixels of your latest screenshot.' },
  y0: { type: 'number', description: 'Top of the box.' },
  x1: { type: 'number', description: 'Right of the box.' },
  y1: { type: 'number', description: 'Bottom of the box.' },
  keep: {
    type: 'boolean',
    description: 'Keep the marks already on the screen. Default: false - replace them.',
  },
} as const

const BOX_REQUIRED = ['x0', 'y0', 'x1', 'y1']

const text = (value: string, isError = false) =>
  new ToolOutput({ content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) })

/** Разговор вызова: ключ Computer Use у разговора панели - id его вкладки. */
const conversationOf = (call: NativeCall): string => deskCall(call, stepOf({}, 'screenshot')).key

/**
 * Ответ метки. Снимок не годится - свежий снимок и причина: модель смотрит заново, как при отказе
 * действия Computer Use (ADR 0129). Показа нет - словами.
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
        text: `${outcome.refusal} Nothing was marked: this screenshot shows the screen now, mark again by it. ${shot.text}`,
      },
    ],
    isError: true,
  })
}

/** Область по двум углам: обводка или затемнение. */
const boxMark =
  (kind: 'circle' | 'spotlight') =>
  async (args: Record<string, unknown>, api: WalkthroughApi, call: NativeCall) => {
    const corners: [MarkPoint, MarkPoint] = [pointArg(args, 'x0', 'y0'), pointArg(args, 'x1', 'y1')]
    const keep = booleanArg(args, 'keep', false)

    return answer(await api.desk.mark(conversationOf(call), { kind, corners }, keep), api, call)
  }

/**
 * Инструменты показа Walkthrough (ADR 0134). Все - без вопроса человеку: они рисуют поверх его
 * экрана, ждут его шага или кладут трубку звонка, который он сам начал, и ничего в его данных не
 * меняют. Действия на экране - инструменты Computer Use.
 */
export const WALKTHROUGH_TOOLS: NativeTool<WalkthroughApi>[] = [
  {
    name: 'circle',
    description:
      'Circle what the user should look at with a marker, like a person drawing on the screen. Give the box tight around the thing; the circle adds its own margin. Call it before your words about the thing: it appears when your earlier words have been spoken.',
    access: 'read',
    inputSchema: { type: 'object', properties: BOX_PROPERTIES, required: BOX_REQUIRED },
    run: boxMark('circle'),
  },
  {
    name: 'arrow',
    description:
      'Point at a spot with an arrow, when a circle is not enough (a tiny thing, a spot among many alike). x, y is the arrow tip. Without from_x, from_y the arrow comes from the side with more room.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Tip X, in pixels of your latest screenshot.' },
        y: { type: 'number', description: 'Tip Y.' },
        from_x: { type: 'number', description: 'Optional start X of the arrow.' },
        from_y: { type: 'number', description: 'Optional start Y of the arrow.' },
        keep: BOX_PROPERTIES.keep,
      },
      required: ['x', 'y'],
    },
    run: async (args, api, call) => {
      const hasFrom = args['from_x'] !== undefined || args['from_y'] !== undefined
      const request: MarkRequest = {
        kind: 'arrow',
        to: pointArg(args),
        from: hasFrom ? pointArg(args, 'from_x', 'from_y') : null,
      }
      const keep = booleanArg(args, 'keep', false)

      return answer(await api.desk.mark(conversationOf(call), request, keep), api, call)
    },
  },
  {
    name: 'spotlight',
    description:
      'Dim everything but a box, when the screen is busy and a circle would get lost. Use it rarely; add a circle with keep if needed.',
    access: 'read',
    inputSchema: { type: 'object', properties: BOX_PROPERTIES, required: BOX_REQUIRED },
    run: boxMark('spotlight'),
  },
  {
    name: 'clear',
    description: 'Remove all marks once your earlier words have been spoken.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, api, call) => {
      const refusal = await api.desk.clear(conversationOf(call))

      return refusal ? text(refusal, true) : text('Marks will be removed after your earlier words.')
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
    name: 'finish',
    description:
      'End the walkthrough: the voice call hangs up once your last words have been spoken. Then write a short recap in the chat.',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, api, call) => text(await api.desk.finish(conversationOf(call), call.signal)),
  },
]

/** Источник инструментов показа поверх Computer Use этой машины. */
export const createWalkthroughSource = (api: WalkthroughApi) =>
  new NativeSource(WALKTHROUGH_TOOLS, api, [ComputerError])

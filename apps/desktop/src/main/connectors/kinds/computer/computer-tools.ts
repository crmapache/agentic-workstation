import { numberArg, stringArg, ToolOutput, NativeSource } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { ComputerAgent, ComputerAnswer } from '../../../computer/computer-agent'
import { ComputerError } from '../../../computer/computer-error'
import { WAIT_MAX_S, WHEEL_NOTCH_PX, WHEEL_NOTCHES_MAX } from '../../../computer/computer.constants'
import {
  schema,
  stepOf,
  textArg,
  chordArg,
  deskCall,
  oneOfArg,
  pointArg,
  POINT_PROPERTIES,
} from './computer-args'

/** Снимок с подписью - картинкой и текстом, как его отдаёт MCP. */
const answer = ({ picture, text }: ComputerAnswer) =>
  new ToolOutput({
    content: [
      { type: 'image', data: picture.data, mimeType: picture.mimeType },
      { type: 'text', text },
    ],
  })

const AFTER = 'Returns a fresh screenshot.'

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const

const BUTTONS = ['left', 'right', 'middle'] as const

/**
 * Инструменты Computer Use (ADR 0057): снимок и его область - чтение, действия мышью и
 * клавиатурой - запись. Отправки людям у них нет своей: что уйдёт наружу, решает приложение,
 * в котором ИИ нажимает, - об этом пояснение сервера.
 */
export const COMPUTER_TOOLS: NativeTool<ComputerAgent>[] = [
  {
    name: 'screenshot',
    description:
      "Take a screenshot of one display of the user's computer. Coordinates of every action are pixels of your latest screenshot.",
    access: 'read',
    inputSchema: schema({
      display: {
        type: 'number',
        description:
          'Display number, 1 is the main one. Default: the display of your previous screenshot, or the one with the mouse.',
      },
      wait: {
        type: 'number',
        description: `Seconds to wait before the screenshot, up to ${WAIT_MAX_S}.`,
      },
    }),
    run: async (args, agent, call) => {
      const display = numberArg(args, 'display', { min: 1, max: 16, fallback: 0 })
      const wait = numberArg(args, 'wait', { min: 0, max: WAIT_MAX_S, fallback: 0 })

      return answer(
        await agent.screenshot(
          deskCall(call, stepOf(args, 'screenshot')),
          display || null,
          wait * 1000,
        ),
      )
    },
  },
  {
    name: 'zoom',
    description:
      'See a region of your latest screenshot at full screen detail: small text, icons. x0, y0 - x1, y1 are its pixels.',
    access: 'read',
    inputSchema: schema(
      {
        x0: { type: 'number' },
        y0: { type: 'number' },
        x1: { type: 'number' },
        y1: { type: 'number' },
      },
      ['x0', 'y0', 'x1', 'y1'],
    ),
    run: async (args, agent, call) => {
      const from = pointArg(args, 'x0', 'y0')
      const to = pointArg(args, 'x1', 'y1')
      const picture = await agent.zoom(deskCall(call, stepOf(args, 'zoom')), [
        from.x,
        from.y,
        to.x,
        to.y,
      ])

      return new ToolOutput({
        content: [{ type: 'image', data: picture.data, mimeType: picture.mimeType }],
      })
    },
  },
  {
    name: 'click',
    description: `Move the mouse to a point like a person and click. ${AFTER}`,
    access: 'write',
    inputSchema: schema(
      {
        ...POINT_PROPERTIES,
        button: { type: 'string', enum: BUTTONS, description: 'Default: left.' },
        clicks: { type: 'number', description: '2 - double click, 3 - triple click. Default: 1.' },
        modifiers: {
          type: 'string',
          description: 'Keys held during the click, like "cmd" or "shift+option".',
        },
      },
      ['x', 'y'],
    ),
    run: async (args, agent, call) =>
      answer(
        await agent.click(deskCall(call, stepOf(args, 'click')), pointArg(args), {
          button: oneOfArg(args, 'button', BUTTONS, 'left'),
          count: numberArg(args, 'clicks', { min: 1, max: 3, fallback: 1 }),
          chord: chordArg(stringArg(args, 'modifiers')),
        }),
      ),
  },
  {
    name: 'move',
    description: `Move the mouse to a point without clicking: hover menus, tooltips. ${AFTER}`,
    access: 'write',
    inputSchema: schema(POINT_PROPERTIES, ['x', 'y']),
    run: async (args, agent, call) =>
      answer(await agent.move(deskCall(call, stepOf(args, 'move')), pointArg(args))),
  },
  {
    name: 'drag',
    description: `Press at x, y, drag to to_x, to_y and let go. ${AFTER}`,
    access: 'write',
    inputSchema: schema(
      {
        ...POINT_PROPERTIES,
        to_x: { type: 'number', description: 'Where to let go, X.' },
        to_y: { type: 'number', description: 'Where to let go, Y.' },
      },
      ['x', 'y', 'to_x', 'to_y'],
    ),
    run: async (args, agent, call) =>
      answer(
        await agent.drag(
          deskCall(call, stepOf(args, 'drag')),
          pointArg(args),
          pointArg(args, 'to_x', 'to_y'),
        ),
      ),
  },
  {
    name: 'scroll',
    description: `Scroll with the mouse wheel over a point. ${AFTER}`,
    access: 'write',
    inputSchema: schema(
      {
        ...POINT_PROPERTIES,
        direction: { type: 'string', enum: DIRECTIONS },
        amount: {
          type: 'number',
          description: `Wheel notches, 1 to ${WHEEL_NOTCHES_MAX}. Default: 5.`,
        },
      },
      ['x', 'y', 'direction'],
    ),
    run: async (args, agent, call) => {
      const direction = oneOfArg(args, 'direction', DIRECTIONS, 'down')
      const amount = numberArg(args, 'amount', { min: 1, max: WHEEL_NOTCHES_MAX, fallback: 5 })
      const pixels = amount * WHEEL_NOTCH_PX
      const sign = direction === 'up' || direction === 'left' ? -1 : 1
      const isVertical = direction === 'up' || direction === 'down'

      return answer(
        await agent.scroll(deskCall(call, stepOf(args, 'scroll', direction)), pointArg(args), {
          down: isVertical ? sign * pixels : 0,
          right: isVertical ? 0 : sign * pixels,
        }),
      )
    },
  },
  {
    name: 'type',
    description: `Type text into whatever has the keyboard focus. A new line presses Return. ${AFTER}`,
    access: 'write',
    inputSchema: schema({ text: { type: 'string' } }, ['text']),
    run: async (args, agent, call) =>
      answer(await agent.type(deskCall(call, stepOf(args, 'type')), textArg(args))),
  },
  {
    name: 'key',
    description: `Press a key or a combination: "return", "escape", "cmd+t", "cmd+shift+4", "page_down" (on Windows cmd is Ctrl, win is the Windows key). ${AFTER}`,
    access: 'write',
    inputSchema: schema(
      {
        keys: { type: 'string' },
        repeat: { type: 'number', description: 'How many times, up to 20. Default: 1.' },
      },
      ['keys'],
    ),
    run: async (args, agent, call) => {
      const keys = stringArg(args, 'keys', true)
      const chord = chordArg(keys)

      if (!chord) throw new ComputerError('failed', '"keys" is empty.')

      const repeat = numberArg(args, 'repeat', { min: 1, max: 20, fallback: 1 })

      return answer(await agent.key(deskCall(call, stepOf(args, 'key', keys)), chord, keys, repeat))
    },
  },
  {
    name: 'open_app',
    description: `Open an app or bring it to the front by its name, like "Google Chrome" or "System Settings" (on Windows - as named in the Start menu). ${AFTER}`,
    access: 'write',
    inputSchema: schema({ name: { type: 'string' } }, ['name']),
    run: async (args, agent, call) => {
      const name = stringArg(args, 'name', true)

      return answer(await agent.openApp(deskCall(call, stepOf(args, 'open_app', name)), name))
    },
  },
]

/** Источник коннектора Computer: инструменты над агентом IDE, разговор кончился - отпустить. */
export const createComputerSource = (agent: ComputerAgent, idle: () => void) =>
  new NativeSource(COMPUTER_TOOLS, agent, [ComputerError], {
    release: (launch) => agent.release(launch.conversationId ?? launch.id),
    endConversation: (conversationId) => agent.endConversation(conversationId),
    dispose: () => {
      idle()

      return Promise.resolve()
    },
  })

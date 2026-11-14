import { it, expect, describe } from 'vitest'

import type { SourceLaunch } from '../../connector-source'
import type { ComputerAgent, ComputerAnswer } from '../../../computer/computer-agent'
import type { DeskCall } from '../../../computer/computer-desk'
import { ComputerError } from '../../../computer/computer-error'
import { COMPUTER_TOOLS, createComputerSource } from './computer-tools'

const ANSWER: ComputerAnswer = { picture: { data: 'AAA', mimeType: 'image/png' }, text: 'shot' }

const LAUNCH: SourceLaunch = {
  id: 'launch-1',
  projectPath: '/work/roas-radar',
  workDir: '/work/roas-radar',
  conversationId: 'conversation-1',
}

/** Агент, который записывает, что у него попросили, и отвечает снимком (или бросает). */
const fakeAgent = (fail?: Error) => {
  const calls: { method: string; call: DeskCall; args: unknown[] }[] = []
  const record =
    (method: string) =>
    (call: DeskCall, ...args: unknown[]) => {
      calls.push({ method, call, args })

      return fail ? Promise.reject(fail) : Promise.resolve(ANSWER)
    }
  const agent = {
    screenshot: record('screenshot'),
    zoom: (call: DeskCall, ...args: unknown[]) => {
      calls.push({ method: 'zoom', call, args })

      return Promise.resolve(ANSWER.picture)
    },
    click: record('click'),
    move: record('move'),
    drag: record('drag'),
    scroll: record('scroll'),
    type: record('type'),
    key: record('key'),
    openApp: record('openApp'),
    release: () => undefined,
    endConversation: () => undefined,
  } as unknown as ComputerAgent

  return { agent, calls }
}

const source = (fail?: Error) => {
  const fake = fakeAgent(fail)

  return { ...fake, source: createComputerSource(fake.agent, () => undefined) }
}

describe('computer tools', () => {
  it('reads with screenshot and zoom, and everything that touches the mouse or keys writes', () => {
    const access = Object.fromEntries(COMPUTER_TOOLS.map((tool) => [tool.name, tool.access]))

    expect(access).toEqual({
      screenshot: 'read',
      zoom: 'read',
      click: 'write',
      move: 'write',
      drag: 'write',
      scroll: 'write',
      type: 'write',
      key: 'write',
      open_app: 'write',
    })
  })

  it('answers with the picture and its note, and keys the desk by conversation and project', async () => {
    const { source: computer, calls } = source()
    const result = await computer.callTool('click', { x: 10, y: 20, clicks: 2 }, undefined, LAUNCH)

    expect(result.content).toEqual([
      { type: 'image', data: 'AAA', mimeType: 'image/png' },
      { type: 'text', text: 'shot' },
    ])
    expect(calls[0]).toMatchObject({
      method: 'click',
      call: { key: 'conversation-1', label: 'roas-radar' },
      args: [
        { x: 10, y: 20 },
        { button: 'left', count: 2, chord: null },
      ],
    })
  })

  it('gives the capsule the model words for the step, or the action itself without them', async () => {
    const { source: computer, calls } = source()

    await computer.callTool(
      'click',
      { x: 1, y: 2, intent: '  Opening\n the menu ' },
      undefined,
      LAUNCH,
    )
    await computer.callTool('key', { keys: 'cmd+t' }, undefined, LAUNCH)
    await computer.callTool('type', { text: 'secret' }, undefined, LAUNCH)

    expect(calls.map((one) => one.call.step)).toEqual([
      { kind: 'intent', text: 'Opening the menu' },
      { kind: 'action', action: 'key', detail: 'cmd+t' },
      // Набранный текст бывает паролем - капсула на экране его не повторяет.
      { kind: 'action', action: 'type', detail: '' },
    ])
    expect(COMPUTER_TOOLS.every((tool) => 'intent' in (tool.inputSchema.properties ?? {}))).toBe(
      true,
    )
  })

  it('turns scroll direction and notches into pixels', async () => {
    const { source: computer, calls } = source()

    await computer.callTool('scroll', { x: 1, y: 2, direction: 'up', amount: 3 }, undefined, LAUNCH)

    expect(calls[0]?.args[1]).toEqual({ down: -240, right: 0 })
  })

  it('tells the model what is wrong with its arguments instead of failing the call', async () => {
    const { source: computer, calls } = source()

    const noPoint = await computer.callTool('click', { x: 10 }, undefined, LAUNCH)
    const badKey = await computer.callTool('key', { keys: 'cmd+banana' }, undefined, LAUNCH)
    const badButton = await computer.callTool(
      'click',
      { x: 1, y: 1, button: 'side' },
      undefined,
      LAUNCH,
    )

    expect(noPoint).toMatchObject({ isError: true })
    expect(badKey.content).toEqual([
      { type: 'text', text: 'Unknown key "banana" in "cmd+banana".' },
    ])
    expect(badButton).toMatchObject({ isError: true })
    expect(calls).toHaveLength(0)
  })

  it('types whitespace as it is: a lone new line is text too', async () => {
    const { source: computer, calls } = source()

    await computer.callTool('type', { text: '\n' }, undefined, LAUNCH)
    const empty = await computer.callTool('type', { text: '' }, undefined, LAUNCH)

    expect(calls[0]?.args).toEqual(['\n'])
    expect(empty).toMatchObject({ isError: true })
  })

  it('passes the user pressing Stop on to the model as text', async () => {
    const stop = new ComputerError('stopped', 'The user pressed Stop.')
    const { source: computer } = source(stop)
    const result = await computer.callTool('screenshot', {}, undefined, LAUNCH)

    expect(result).toEqual({
      content: [{ type: 'text', text: 'The user pressed Stop.' }],
      isError: true,
    })
  })
})

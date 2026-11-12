import { rm, mkdtemp } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { encodeFrame, FrameDecoder } from '@agentic-workstation/browser-protocol/framing'
import { encodeLine, LineSplitter } from '@agentic-workstation/browser-protocol/lines'

import { HostBridge } from './host-bridge'

type Message = Record<string, unknown>

/** IDE глазами host: сокет, строки JSON туда и обратно. */
class FakeIde {
  readonly server: Server
  socket: Socket | null = null
  readonly received: Message[] = []

  constructor(path: string) {
    this.server = createServer((socket) => {
      const lines = new LineSplitter()

      this.socket = socket
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => {
        for (const line of lines.push(chunk)) this.received.push(JSON.parse(line) as Message)
      })
    })
    this.server.listen(path)
  }

  send(message: unknown): void {
    this.socket?.write(encodeLine(message))
  }

  close(): Promise<void> {
    this.socket?.destroy()

    return new Promise((resolve) => this.server.close(() => resolve()))
  }
}

describe('мост host: ответы только на запросы нынешней IDE', () => {
  let dir = ''
  let path = ''
  let bridge: HostBridge
  let toChrome: Message[] = []

  beforeEach(async () => {
    // Путь сокета короткий: у macOS предел 104 байта, а tmpdir() длинный.
    dir = await mkdtemp('/tmp/aw-bridge-')
    path = join(dir, 'ide.sock')
    toChrome = []

    const frames = new FrameDecoder()

    bridge = new HostBridge({
      toChrome: (frame) => toChrome.push(...(frames.push(frame) as Message[])),
      connect: () => connect(path),
      log: () => undefined,
      exit: () => undefined,
    })
  })

  afterEach(async () => {
    bridge.close()
    await rm(dir, { recursive: true, force: true })
  })

  const fromChrome = (message: unknown) => bridge.fromChrome(encodeFrame(message))

  it('поздний ответ на запрос прежней IDE в новую не уходит', async () => {
    const first = new FakeIde(path)

    bridge.start()
    await expect.poll(() => toChrome.at(-1)).toEqual({ type: 'host', status: 'connected' })

    first.send({ type: 'request', id: 5, method: 'debugger.attach', params: { tabId: 1 } })
    await expect.poll(() => toChrome.some((message) => message['id'] === 5)).toBe(true)
    await first.close()
    await expect.poll(() => toChrome.at(-1)).toEqual({ type: 'host', status: 'ide-offline' })

    const second = new FakeIde(path)

    await expect
      .poll(() => toChrome.at(-1), { timeout: 5000 })
      .toMatchObject({
        status: 'connected',
      })

    // Расширение отвечает на старый запрос уже после перезапуска IDE.
    fromChrome({ type: 'response', id: 5, result: null })
    second.send({ type: 'request', id: 6, method: 'tabs.list', params: {} })
    await expect.poll(() => toChrome.some((message) => message['id'] === 6)).toBe(true)
    fromChrome({ type: 'response', id: 6, result: { tabs: [] } })
    fromChrome({ type: 'event', name: 'tab-removed', data: { tabId: 2 } })

    await expect.poll(() => second.received.length).toBe(2)
    expect(second.received).toEqual([
      { type: 'response', id: 6, result: { tabs: [] } },
      { type: 'event', name: 'tab-removed', data: { tabId: 2 } },
    ])

    // Второй ответ на тот же id - тоже лишний.
    fromChrome({ type: 'response', id: 6, result: null })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(second.received).toHaveLength(2)
    await second.close()
  }, 10_000)
})

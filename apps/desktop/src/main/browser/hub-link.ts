import { randomInt } from 'node:crypto'
import type { Socket } from 'node:net'

import { parseLine, encodeLine, LineSplitter } from '@agentic-workstation/browser-protocol/lines'
import { parseExtensionMessage } from '@agentic-workstation/browser-protocol/protocol'
import type {
  EventMessage,
  HelloMessage,
  BrowserMethod,
  BrowserMethods,
  IdeToExtension,
} from '@agentic-workstation/browser-protocol/protocol'

import { BrowserError } from './browser-error'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: BrowserError) => void
  done: () => void
}

export type LinkHandlers = {
  hello: (link: HubLink, hello: HelloMessage) => void
  event: (link: HubLink, event: EventMessage) => void
  closed: (link: HubLink) => void
}

/**
 * id запросов начинаются со случайного места у каждой связи. Начни каждая связь с 1 - и
 * поздний ответ расширения на запрос прежней связи (IDE перезапустилась, host переподключился)
 * совпал бы с id нового запроса и закрыл его чужим ответом. Host отсекает такие ответы и сам
 * (host-bridge.ts); случайное начало - вторая стена. До 2^40: id остаётся точным целым JSON.
 */
const firstRequestId = (): number => randomInt(1, 2 ** 40)

/**
 * Одна связь с расширением через native host: строки JSON по сокету, запросы с id и
 * тайм-аутом, события. Первым должно прийти hello - не пришло вовремя, это не наш host, и
 * связь рвётся.
 */
export class HubLink {
  hello: HelloMessage | null = null
  private readonly pending = new Map<number, Pending>()
  private nextId = firstRequestId()
  private closed = false

  constructor(
    private readonly socket: Socket,
    private readonly handlers: LinkHandlers,
    helloTimeoutMs: number,
  ) {
    const lines = new LineSplitter()
    const helloTimer = setTimeout(() => {
      if (!this.hello) this.close()
    }, helloTimeoutMs)

    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      try {
        for (const line of lines.push(chunk)) this.receive(line)
      } catch (error) {
        console.warn('[browser] связь с расширением оборвана: строка не разобрана', error)
        this.close()
      }
    })
    socket.on('error', () => undefined)
    socket.on('close', () => {
      clearTimeout(helloTimer)
      this.finish()
    })
  }

  send(message: IdeToExtension): void {
    if (!this.closed) this.socket.write(encodeLine(message))
  }

  request<M extends BrowserMethod>(
    method: M,
    params: BrowserMethods[M]['params'],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserMethods[M]['result']> {
    if (this.closed) {
      return Promise.reject(
        new BrowserError('profile-offline', 'The browser profile disconnected.'),
      )
    }

    if (signal?.aborted)
      return Promise.reject(new BrowserError('aborted', 'The call was cancelled.'))

    const id = this.nextId++

    return new Promise<BrowserMethods[M]['result']>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(id)?.reject(
          new BrowserError('timeout', `The browser did not answer ${method} in time.`),
        )
      }, timeoutMs)
      const onAbort = () =>
        this.settle(id)?.reject(new BrowserError('aborted', 'The call was cancelled.'))

      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve,
        reject,
        done: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        },
      })
      this.send({ type: 'request', id, method, params } as IdeToExtension)
    })
  }

  close(): void {
    this.socket.destroy()
    this.finish()
  }

  private receive(line: string): void {
    const message = parseExtensionMessage(parseLine(line))

    if (!message) return

    if (message.type === 'hello') {
      this.hello = message
      this.handlers.hello(this, message)

      return
    }

    // До hello связь ещё не профиль: ответы и события от неё не принимаются.
    if (!this.hello) return

    if (message.type === 'event') {
      this.handlers.event(this, message)

      return
    }

    const pending = this.settle(message.id)

    if (!pending) return

    if ('error' in message)
      pending.reject(new BrowserError(message.error.code, message.error.message))
    else pending.resolve(message.result)
  }

  private settle(id: number): Pending | null {
    const pending = this.pending.get(id)

    if (!pending) return null

    this.pending.delete(id)
    pending.done()

    return pending
  }

  private finish(): void {
    if (this.closed) return

    this.closed = true

    for (const id of [...this.pending.keys()]) {
      this.settle(id)?.reject(
        new BrowserError('profile-offline', 'The browser profile disconnected.'),
      )
    }

    this.handlers.closed(this)
  }
}

import { createServer } from 'node:http'
import type { Server, ServerResponse, IncomingMessage } from 'node:http'

import { CALLBACK_PAGE } from './oauth.constants'

/** Чем кончился вход в браузере. */
export type CallbackResult = { code: string } | { error: 'denied' | 'failed' }

/** Порт возврата занят: идёт вход в другой копии IDE или порт занял кто-то ещё. */
export class CallbackBusyError extends Error {}

/** Адреса, на которых слушать: браузер может прийти на localhost и через IPv6. */
const HOSTS = ['127.0.0.1', '::1'] as const

const listenOn = (server: Server, port: number, host: string): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

/**
 * Приём возврата из браузера после входа: порт поднят только на время входа и отдаёт код,
 * если state совпал. Чужой state или запрос мимо пути - отказ, а не конец входа: страницу
 * мог открыть кто угодно на этой машине, а дождаться надо своего браузера.
 */
export class OAuthCallback {
  readonly result: Promise<CallbackResult>
  private settle: (result: CallbackResult) => void = () => undefined
  private readonly servers: Server[] = []

  private constructor(
    private readonly path: string,
    private readonly state: string,
  ) {
    this.result = new Promise((resolve) => {
      this.settle = resolve
    })
  }

  /** Занять порт и ждать. Порт занят - CallbackBusyError. */
  static async listen(port: number, path: string, state: string): Promise<OAuthCallback> {
    const callback = new OAuthCallback(path, state)

    for (const host of HOSTS) {
      const server = createServer((request, response) => callback.handle(request, response))

      try {
        await listenOn(server, port, host)
        callback.servers.push(server)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code

        // IPv6 на машине может не быть вовсе - хватит и IPv4.
        if (host === '::1' && code === 'EADDRNOTAVAIL') continue

        await callback.close()

        if (code === 'EADDRINUSE') throw new CallbackBusyError(`Порт ${port} занят`)

        throw error
      }
    }

    return callback
  }

  /**
   * Отпустить порт. Вход, который ещё ждал, кончается отказом. Ответ - когда порт
   * действительно свободен: следующий вход сразу займёт его снова.
   */
  close(): Promise<void> {
    const servers = this.servers.splice(0)

    this.settle({ error: 'failed' })

    return Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve())
            // Браузер держит соединение открытым (keep-alive) - без этого порт ждал бы его.
            server.closeAllConnections()
          }),
      ),
    ).then(() => undefined)
  }

  /** Любой сбой разбора - ответ 400, а не исключение главного процесса. */
  private handle(request: IncomingMessage, response: ServerResponse): void {
    try {
      this.answer(request, response)
    } catch (error) {
      console.warn('[connectors] кривой запрос на порт возврата', error)

      if (!response.headersSent) response.writeHead(400)

      response.end()
    }
  }

  private answer(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (url.pathname !== this.path || url.searchParams.get('state') !== this.state) {
      response.writeHead(404).end()

      return
    }

    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const result: CallbackResult = code
      ? { code }
      : { error: error === 'access_denied' ? 'denied' : 'failed' }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('code' in result ? CALLBACK_PAGE.success : CALLBACK_PAGE.failure)
    this.settle(result)
  }
}

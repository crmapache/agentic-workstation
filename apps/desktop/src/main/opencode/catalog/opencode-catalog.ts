import type { HistoryEntry } from '@shared/conversation'

import type { OpenCodeCli } from '../cli/opencode-locator'
import type { OpenCodeDirs, OpenCodeRequest } from '../server/opencode-server'
import { dataOf, OpenCodeServer } from '../server/opencode-server'

/** Через сколько простоя гаснет процесс-каталог - как у Codex. */
const CATALOG_IDLE_MS = 2 * 60 * 1000

/** Сколько разговоров истории просить за раз. */
const HISTORY_PAGE = 50

/** Сколько сообщений журнала - на страницу ленты. */
export const MESSAGES_PAGE = 60

/** Конфиг каталога: моделей ему не нужно - он только читает базу разговоров. */
const CATALOG_CONFIG = JSON.stringify({ share: 'disabled', update: 'disable' })

export type CatalogHost = {
  cli: () => Promise<OpenCodeCli | null>
  dirs: () => OpenCodeDirs
  cwd: string
}

/** Страница журнала сессии: сообщения от старого к новому и курсор раньше (null - раньше нет). */
export type MessagesPage = { messages: Record<string, unknown>[]; cursor: string | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/**
 * Процесс-каталог OpenCode (как у Codex): история проекта, имя и форк сессии, журнал для
 * ленты - когда живой сессии у разговора нет. База разговоров у всех процессов IDE общая (свои
 * папки OpenCode), так что каталог видит то же, что сессии. Поднимается по первому вопросу и
 * гаснет после простоя; ответ, который не пришёл, - пустой, а не исключение посреди панели.
 */
export class OpenCodeCatalog {
  private server: OpenCodeServer | null = null
  private starting: Promise<OpenCodeServer | null> | null = null
  private idleTimer: NodeJS.Timeout | null = null

  constructor(private readonly host: CatalogHost) {}

  /** Прошлые разговоры папки проекта, свежие первыми; open - id сессий, открытых вкладками. */
  async history(projectPath: string, open: ReadonlySet<string>): Promise<HistoryEntry[]> {
    const body = await this.ask('GET', '/api/session', {
      // Только разговоры: сессии субагентов (с родителем) - не отдельные разговоры.
      query: {
        directory: projectPath,
        limit: String(HISTORY_PAGE),
        order: 'desc',
        parentID: 'null',
      },
    })

    return records(dataOf(body)).map((session) => {
      const time = isRecord(session['time']) ? session['time'] : {}
      const id = text(session, 'id')

      return {
        sessionId: id,
        title: text(session, 'title'),
        updatedAt: typeof time['updated'] === 'number' ? time['updated'] : 0,
        isOpen: open.has(id),
      }
    })
  }

  /** Убрать запись указаний сессии (бриф прогона, открытого чатом); не вышло - тихо. */
  async dropInstructions(sessionId: string, key: string): Promise<void> {
    await this.ask('DELETE', `/api/experimental/session/${sessionId}/instructions/entries/${key}`)
  }

  /** Сессия по id; нет её или каталог не ответил - null. */
  async session(sessionId: string): Promise<Record<string, unknown> | null> {
    const session = dataOf(await this.ask('GET', `/api/session/${sessionId}`))

    return isRecord(session) ? session : null
  }

  /** Страница журнала сессии перед cursor (null - последняя), от старого к новому. */
  async messages(sessionId: string, cursor: string | null): Promise<MessagesPage> {
    const body = await this.ask('GET', `/api/session/${sessionId}/message`, {
      // Порядок задаёт первая страница, дальше его несёт курсор: вместе их OpenCode не берёт.
      query: { limit: String(MESSAGES_PAGE), ...(cursor ? { cursor } : { order: 'desc' }) },
    })
    const messages = records(dataOf(body)).toReversed()
    const next = isRecord(body) && isRecord(body['cursor']) ? body['cursor']['next'] : null

    return {
      messages,
      cursor: messages.length >= MESSAGES_PAGE && typeof next === 'string' ? next : null,
    }
  }

  /** Форк сессии до сообщения (null - целиком); id новой сессии или null. */
  async fork(sessionId: string, before: string | null): Promise<string | null> {
    const forked = dataOf(
      await this.ask('POST', `/api/session/${sessionId}/fork`, { body: before ? { before } : {} }),
    )

    return isRecord(forked) && typeof forked['id'] === 'string' ? forked['id'] : null
  }

  async rename(sessionId: string, title: string): Promise<void> {
    await this.ask('PATCH', `/api/session/${sessionId}`, { body: { title } })
  }

  async dispose(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = null

    const server = this.server

    this.server = null
    await server?.stop()
  }

  /** Вопрос каталогу; сбой - null (в журнал), процесс гаснет после простоя. */
  private async ask(method: string, path: string, options?: OpenCodeRequest): Promise<unknown> {
    const server = await this.ensure()

    if (!server) return null

    this.armIdle()

    return server.request(method, path, options).catch((error: unknown) => {
      console.warn(`[opencode] каталог: ${method} ${path} не ответил`, error)

      return null
    })
  }

  /** Живой процесс или новый; два вопроса разом поднимают один процесс, а не два. */
  private ensure(): Promise<OpenCodeServer | null> {
    if (this.server?.isAlive) return Promise.resolve(this.server)

    this.starting ??= this.start().finally(() => {
      this.starting = null
    })

    return this.starting
  }

  private async start(): Promise<OpenCodeServer | null> {
    const cli = await this.host.cli()

    if (!cli) return null

    this.server = new OpenCodeServer(
      {
        binary: cli.binary,
        cwd: this.host.cwd,
        env: cli.env,
        dirs: this.host.dirs(),
        config: CATALOG_CONFIG,
      },
      { onEvent: () => undefined, onExit: () => undefined },
    )

    return this.server
  }

  private armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = setTimeout(() => void this.dispose(), CATALOG_IDLE_MS)
    this.idleTimer.unref()
  }
}

import { mkdir } from 'node:fs/promises'

import type { HistoryEntry } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

import type { AcpCli, AcpAgent } from '../acp-agent'
import { forkIn } from '../client/acp-fork-in'
import { AcpProcess, isAuthError } from '../client/acp-process'
import { ACP_SESSION_TIMEOUT_MS, ACP_CLIENT_CAPABILITIES } from '../client/acp.constants'
import { AcpFeedBuilder } from '../feed/acp-feed-builder'
import type {
  AcpListResult,
  AcpSessionInfo,
  AcpSessionSetup,
  AcpSessionUpdate,
} from '../protocol/acp-types'

/** Сколько живёт процесс-каталог без дела: он нужен списку истории и открытию старого разговора. */
const IDLE_MS = 2 * 60_000

/** Сколько страниц списка разговоров читать: дальше - старьё, которое никто не откроет. */
const MAX_PAGES = 20

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Что сказала пробная сессия: настройки агента и не отказал ли он без входа. */
export type AcpProbe = { setup: AcpSessionSetup | null; signedOut: boolean }

export type AcpCatalogOptions = {
  agent: AcpAgent
  cli: () => Promise<AcpCli | null>
  /** Папка для пробной сессии (список моделей): пустая папка IDE, не проект человека. */
  scratch: string
  version: string
}

/**
 * Процесс-каталог панели ACP (ADR 0092): история проекта (`session/list`), повтор прошлого
 * разговора для ленты (`session/load` - агент повторяет историю обновлениями, потом
 * `session/close`) и меню моделей (пробная сессия в своей пустой папке). Гаснет после простоя.
 * Одна сессия у агента - один писатель (у Kimi - замок): каталог закрывает разговор сразу после
 * повтора, чтобы его мог продолжить процесс вкладки.
 */
export class AcpCatalog {
  private process: AcpProcess | null = null
  private idleTimer: NodeJS.Timeout | null = null
  /** Куда сейчас идут обновления повтора: id сессии → сборщик. */
  private readonly collectors = new Map<string, AcpFeedBuilder>()
  /** Работа по одной: повтор и пробная сессия не должны мешать друг другу. */
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: AcpCatalogOptions) {}

  /** Прошлые разговоры папки проекта, новые сверху; агент не умеет список - пусто. */
  history(projectPath: string, open: ReadonlySet<string>): Promise<HistoryEntry[]> {
    return this.run(async (process) => {
      const init = await process.initialized

      if (!init.agentCapabilities?.sessionCapabilities?.list) return []

      const sessions: AcpSessionInfo[] = []
      let cursor: string | null = null

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const reply = (await process.request('session/list', {
          cwd: projectPath,
          ...(cursor && { cursor }),
        })) as AcpListResult

        sessions.push(...(reply.sessions ?? []))
        cursor = reply.nextCursor ?? null
        if (!cursor) break
      }

      // Фильтр по папке - сами: `agy` 1.5.3 отдавал разговоры всех папок (ADR 0092).
      return sessions
        .filter((session) => session.cwd === projectPath)
        .map((session) => ({
          sessionId: session.sessionId,
          title: session.title ?? '',
          updatedAt: session.updatedAt ? Date.parse(session.updatedAt) || 0 : 0,
          isOpen: open.has(session.sessionId),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    }, [])
  }

  /** Имя и папка прошлого разговора; null - такого нет. */
  async find(projectPath: string, sessionId: string): Promise<HistoryEntry | null> {
    const entries = await this.history(projectPath, new Set())

    return entries.find((entry) => entry.sessionId === sessionId) ?? null
  }

  /**
   * Прошлый разговор лентой: повтор истории в сборщик с префиксом id. Повтор ничего не дал, а
   * разговора нет в списке - null (`agy` отвечает успехом и на чужой id).
   */
  replay(sessionId: string, projectPath: string): Promise<FeedItem[] | null> {
    return this.run(async (process) => {
      const init = await process.initialized
      const builder = new AcpFeedBuilder(
        undefined,
        Date.now,
        this.options.agent.lens([]),
        this.options.agent.toolId,
        'p1-',
      )

      if (!init.agentCapabilities?.loadSession) return null

      this.collectors.set(sessionId, builder)

      try {
        await process.request(
          'session/load',
          { sessionId, cwd: projectPath, mcpServers: [] },
          ACP_SESSION_TIMEOUT_MS,
        )
      } finally {
        this.collectors.delete(sessionId)
      }

      if (init.agentCapabilities.sessionCapabilities?.close) {
        await process.request('session/close', { sessionId }).catch(() => undefined)
      }

      builder.finishReplay()

      // Пусто - разговор без сообщений; null (запасной ответ) - повтор не вышел, его повторят.
      return [...builder.items]
    }, null)
  }

  /**
   * Пробная сессия в пустой папке IDE: настройки агента (модели, размышление, режимы) и что он
   * говорит о входе. Отказ «Authentication required» - не вошли (signedOut). Сессия потом
   * удаляется, где агент умеет, или забывается силами драйвера.
   */
  probe(): Promise<AcpProbe> {
    return this.run<AcpProbe>(
      async (process) => {
        const init = await process.initialized

        await mkdir(this.options.scratch, { recursive: true })

        let setup: AcpSessionSetup

        try {
          setup = (await process.request(
            'session/new',
            { cwd: this.options.scratch, mcpServers: [] },
            ACP_SESSION_TIMEOUT_MS,
          )) as AcpSessionSetup
        } catch (error) {
          if (isAuthError(error)) return { setup: null, signedOut: true }
          throw error
        }

        const sessions = init.agentCapabilities?.sessionCapabilities

        if (setup.sessionId) {
          const id = setup.sessionId

          if (sessions?.delete) {
            await process.request('session/delete', { sessionId: id }).catch(() => undefined)
          } else if (sessions?.close) {
            await process.request('session/close', { sessionId: id }).catch(() => undefined)
          }
          await this.options.agent.forget?.(id)
        }

        return { setup, signedOut: false }
      },
      { setup: null, signedOut: false },
    )
  }

  /** Выйти из агента (ACP `logout`); не умеет или отказал - false. */
  logout(): Promise<boolean> {
    return this.run(async (process) => {
      const init = await process.initialized

      if (!init.agentCapabilities?.auth?.logout) return false

      await process.request('logout', {})

      return true
    }, false)
  }

  /** Форк спящего разговора целиком (`session/fork`); агент не умеет или не вышло - null. */
  fork(sessionId: string, projectPath: string): Promise<string | null> {
    return this.run(async (process) => {
      const init = await process.initialized

      if (!init.agentCapabilities?.sessionCapabilities?.fork) return null

      return forkIn(process, sessionId, projectPath)
    }, null)
  }

  /** Удалить прошлый разговор у агента; не умеет - false. */
  delete(sessionId: string): Promise<boolean> {
    return this.run(async (process) => {
      const init = await process.initialized

      if (!init.agentCapabilities?.sessionCapabilities?.delete) return false

      await process.request('session/delete', { sessionId })

      return true
    }, false)
  }

  dispose(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = null

    const process = this.process

    this.process = null

    return process ? process.stop() : Promise.resolve()
  }

  /** Работа с процессом-каталогом по очереди; не вышло - fallback и строка в журнал. */
  private run<T>(work: (process: AcpProcess) => Promise<T>, fallback: T): Promise<T> {
    const next = this.chain.then(async () => {
      // Работа началась - простой кончился: таймер не гасит процесс посреди повтора.
      if (this.idleTimer) clearTimeout(this.idleTimer)
      this.idleTimer = null

      const process = await this.ensure()

      if (!process) return fallback

      try {
        return await work(process)
      } catch (error) {
        console.warn(`[${this.options.agent.tag}] каталог:`, error)

        return fallback
      } finally {
        this.armIdle()
      }
    })

    this.chain = next.catch(() => undefined)

    return next
  }

  private async ensure(): Promise<AcpProcess | null> {
    if (this.process?.isAlive) return this.process

    const cli = await this.options.cli()

    if (!cli) return null

    const launch = this.options.agent.launch('default')

    await mkdir(this.options.scratch, { recursive: true })

    const process: AcpProcess = new AcpProcess(
      {
        binary: cli.binary,
        args: launch.args,
        cwd: this.options.scratch,
        env: { ...cli.env, ...launch.env },
        capabilities: ACP_CLIENT_CAPABILITIES,
        version: this.options.version,
      },
      {
        onNotification: (method, params) => this.collect(method, params),
        // Каталог не ведёт ходов: вопросов он не ждёт.
        onRequest: (method) => Promise.reject(new Error(`catalog: ${method}`)),
        // Ссылку снимает только вышедший сам процесс: гаснущий старый не затирает новый.
        onExit: () => {
          if (this.process === process) this.process = null
        },
      },
    )

    this.process = process

    return this.process
  }

  private collect(method: string, params: unknown): void {
    if (method !== 'session/update' || !isRecord(params)) return

    const builder = this.collectors.get(String(params['sessionId']))

    builder?.update(params['update'] as AcpSessionUpdate)
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = setTimeout(() => void this.dispose(), IDLE_MS)
    this.idleTimer.unref()
  }
}

import type { AccountUsage } from '@shared/account-usage'
import type { ModelInfo, HistoryEntry } from '@shared/conversation'

import { TURNS_PAGE, CODEX_CLIENT, HISTORY_PAGE, CATALOG_IDLE_MS } from '../codex.constants'
import { AppServerProcess } from '../app-server/app-server-process'
import type { CodexCli } from '../cli/codex-locator'
import type { CodexAccount, CodexTurnsPage } from './catalog-shapes'
import {
  turnsFromList,
  modelsFromList,
  accountFromRead,
  historyFromList,
  usageFromLimits,
} from './catalog-shapes'

/** Что каталогу нужно: Codex выбранного аккаунта (окружение с его CODEX_HOME) и версия IDE. */
export type CatalogHost = {
  cli: () => Promise<CodexCli | null>
  version: string
  /** Папка, в которой поднимать процесс: домашняя - каталогу проект не нужен. */
  cwd: string
  /** Уведомления процесса: конец входа, смена аккаунта, лимиты. */
  onNotification?: ((method: string, params: unknown) => void) | undefined
}

/** Начатый вход через ChatGPT: id входа и ссылка, которую открыть в браузере. */
export type CodexLogin = { loginId: string; authUrl: string }

/**
 * Процесс-каталог Codex (как у amazing-codex): один на панель, отвечает на вопросы без
 * разговора - модели, кто вошёл, лимиты, прошлые разговоры проекта. Поднимается по первому
 * вопросу и гаснет после простоя; смена аккаунта - новый процесс (reset). Нет Codex - пусто.
 */
export class CodexCatalog {
  private server: AppServerProcess | null = null
  private starting: Promise<AppServerProcess | null> | null = null
  private idleTimer: NodeJS.Timeout | null = null
  /** Идёт вход: процесс ждёт возврата из браузера и гаснуть по простою не должен. */
  private holding = false
  /**
   * Поколение процесса: сброс (смена аккаунта) и закрытие его меняют, и запуск, начатый до
   * них, своего процесса не поднимает - иначе каталог аккаунта жил бы на чужом входе, а лишний
   * процесс - без таймера простоя.
   */
  private generation = 0

  constructor(private readonly host: CatalogHost) {}

  async models(): Promise<ModelInfo[]> {
    return modelsFromList(await this.ask('model/list', { includeHidden: false }))
  }

  async account(): Promise<CodexAccount | null | undefined> {
    return accountFromRead(await this.ask('account/read', { refreshToken: false }))
  }

  async usage(): Promise<AccountUsage> {
    return usageFromLimits(await this.ask('account/rateLimits/read'), Date.now())
  }

  /** Прошлые разговоры папки проекта, свежие первыми. */
  async history(projectPath: string, open: ReadonlySet<string>): Promise<HistoryEntry[]> {
    const result = await this.ask('thread/list', {
      limit: HISTORY_PAGE,
      sortKey: 'updated_at',
      cwd: [projectPath],
    })

    return historyFromList(result, open)
  }

  /**
   * Поток по id - без ходов: папка и имя. null - такого потока у Codex нет. Ищется напрямую, а
   * не в первой странице истории: прогон задания недельной давности там уже не стоит.
   */
  async thread(threadId: string): Promise<{ cwd: string; title: string } | null> {
    const result = await this.ask('thread/read', { threadId, includeTurns: false }).catch(
      () => null,
    )
    const thread =
      typeof result === 'object' && result !== null && 'thread' in result ? result.thread : null

    if (typeof thread !== 'object' || thread === null) return null

    const field = (key: string) => {
      const value = (thread as Record<string, unknown>)[key]

      return typeof value === 'string' ? value : ''
    }

    return { cwd: field('cwd'), title: field('name') || field('preview') }
  }

  /**
   * Страница прошлых ходов разговора, свежие первыми, с элементами целиком; cursor - с
   * какой страницы, null - с последней. Читается из журнала потока, живая сессия ему не мешает.
   */
  async turns(threadId: string, cursor: string | null): Promise<CodexTurnsPage> {
    const result = await this.ask('thread/turns/list', {
      threadId,
      cursor,
      limit: TURNS_PAGE,
      sortDirection: 'desc',
      itemsView: 'full',
    })

    return turnsFromList(result)
  }

  /**
   * Вход через ChatGPT (`account/login/start`): ссылка для браузера. Возврат ловит сам Codex
   * и присылает `account/login/completed`; до него процесс не гаснет. null - вход не начался.
   */
  async startSignIn(): Promise<CodexLogin | null> {
    const result = await this.ask('account/login/start', { type: 'chatgpt' })
    const login =
      typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
    const loginId = typeof login['loginId'] === 'string' ? login['loginId'] : ''
    const authUrl = typeof login['authUrl'] === 'string' ? login['authUrl'] : ''

    if (!loginId || !authUrl) return null

    this.holding = true
    this.clearIdle()

    return { loginId, authUrl }
  }

  async cancelSignIn(loginId: string): Promise<void> {
    await this.ask('account/login/cancel', { loginId })
    this.signInDone()
  }

  /** Вход кончился (вошли, отказ, отмена): процесс снова гаснет по простою. */
  signInDone(): void {
    this.holding = false
    this.armIdle()
  }

  /** Выйти из Codex (`account/logout`): вход стирается и у терминального Codex; false - сбой. */
  async signOut(): Promise<boolean> {
    return (await this.ask('account/logout')) !== null
  }

  /** Навыки папки проекта (`skills/list`) - для подсказки «/» ещё до первого хода. */
  async skills(projectPath: string): Promise<unknown> {
    return this.ask('skills/list', { cwds: [projectPath] })
  }

  /** Имя потока без живой сессии (`thread/name/set`). */
  async rename(threadId: string, name: string): Promise<void> {
    await this.ask('thread/name/set', { threadId, name })
  }

  /** Аккаунт или окружение сменились: старый процесс гаснет, следующий вопрос поднимет новый. */
  reset(): void {
    const server = this.server

    this.generation += 1
    this.server = null
    this.starting = null
    this.holding = false
    this.clearIdle()
    void server?.stop()
  }

  async dispose(): Promise<void> {
    const starting = this.starting

    this.reset()
    // Запуск, который уже шёл, процесса не поднимет (поколение сменилось), но дождаться его надо.
    await starting
  }

  /** Вопрос каталогу; Codex нет или процесс не ответил - null, панель покажет пустое. */
  private async ask(method: string, params?: unknown): Promise<unknown> {
    const server = await this.ensure()

    if (!server) return null

    this.armIdle()

    return server.request(method, params).catch((error: unknown) => {
      console.warn(`[codex] каталог: ${method} не ответил`, error)

      return null
    })
  }

  private ensure(): Promise<AppServerProcess | null> {
    if (this.server?.isAlive) return Promise.resolve(this.server)

    if (this.starting) return this.starting

    // Свой запуск снимает только себя: после сброса здесь уже может стоять новый.
    const starting: Promise<AppServerProcess | null> = this.start().finally(() => {
      if (this.starting === starting) this.starting = null
    })

    this.starting = starting

    return starting
  }

  private async start(): Promise<AppServerProcess | null> {
    const generation = this.generation
    const cli = await this.host.cli()

    if (!cli || generation !== this.generation) return null

    const server = new AppServerProcess(
      {
        binary: cli.binary,
        args: [],
        cwd: this.host.cwd,
        env: cli.env,
        client: { ...CODEX_CLIENT, version: this.host.version },
      },
      {
        onNotification: (method, params) => this.host.onNotification?.(method, params),
        // Каталог разговоров не ведёт: вопросов к человеку у него не бывает.
        onServerRequest: (id, method) => server.respondError(id, -32_601, `Unsupported: ${method}`),
        onExit: () => {
          if (this.server === server) this.server = null
        },
      },
    )

    this.server = server

    return server
  }

  private armIdle() {
    this.clearIdle()
    if (this.holding) return
    this.idleTimer = setTimeout(() => this.reset(), CATALOG_IDLE_MS)
    this.idleTimer.unref()
  }

  private clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = null
  }
}

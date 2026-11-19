import type { AccountUsage } from '@shared/account-usage'
import type { AccountsState } from '@shared/accounts'

import { USAGE_MIN_MS } from '../codex.constants'
import type { CodexAccount } from '../catalog/catalog-shapes'
import type { CodexCatalog } from '../catalog/codex-catalog'
import type { CodexAccounts } from './codex-accounts'
import { CodexSignIn } from './codex-sign-in'

/** Что столу аккаунтов нужно от панели Codex. */
export type AccountDeskHost = {
  /** Каталог аккаунта в работе - на нём модели, лимиты, история. */
  catalog: CodexCatalog
  /** Свой каталог другого аккаунта (вход нового, лимиты не текущего); гасить - тому, кто взял. */
  catalogFor: (
    accountId: string,
    onNotice: (method: string, params: unknown) => void,
  ) => CodexCatalog
  openUrl: (url: string) => boolean
  changed: () => void
  /** Аккаунт в работе сменился или вошёл заново: каталог и разговоры - на нём. */
  accountChanged: () => Promise<void>
  cliFound: () => boolean
}

/** Идущий вход: в какой аккаунт и его поток (у нового - свой каталог). */
type Flow = { accountId: string; signIn: CodexSignIn; catalog: CodexCatalog | null }

/**
 * Аккаунты Codex панели (ADR 0083, как в amazing-codex): обычный вход и добавленные, у каждого
 * свой вход. Вход в аккаунт в работе - его каталогом; в новый и не текущий - своим каталогом
 * с его CODEX_HOME, который гаснет с концом входа. Новый, вошедший тем же человеком, что уже
 * есть, - дубль: не встаёт (twin). Лимиты не текущих - разовым каталогом по просьбе окна.
 *
 * Действия с аккаунтами идут по одному: «забыть» посреди входа в тот же аккаунт или выход
 * посреди смены аккаунта иначе разошлись бы с тем, что лежит на диске.
 */
export class CodexAccountDesk {
  private readonly usage = new Map<string, AccountUsage>()
  /** Когда спрашивали лимиты не текущего аккаунта: окно просит их по таймеру. */
  private readonly usageAskedAt = new Map<string, number>()
  private othersAsking: Promise<void> | null = null
  private flow: Flow | null = null
  private outcome: AccountsState['lastOutcome'] = null
  private queue: Promise<unknown> = Promise.resolve()
  /** Кто вошёл в аккаунт в работе; null - не вошёл, undefined - ещё не узнали. */
  private live: CodexAccount | null | undefined = undefined

  constructor(
    readonly accounts: CodexAccounts,
    private readonly host: AccountDeskHost,
  ) {}

  get current(): CodexAccount | null | undefined {
    return this.live
  }

  /**
   * Ответ Codex о входе аккаунта в работе. Узнали, кто вошёл, - он же в список: строка
   * останется верной, когда в работу встанет другой аккаунт. Пишется, только если поменялось.
   */
  set current(account: CodexAccount | null | undefined) {
    this.live = account

    const row = this.accounts.find(this.accounts.current)
    const facts = account === null ? { email: '', plan: '' } : account

    if (row && facts && (row.email !== facts.email || row.plan !== facts.plan)) {
      this.accounts.remember(row.id, { email: facts.email, plan: facts.plan })
    }
  }

  /** Уведомление каталога аккаунта в работе: конец входа в него. */
  catalogNotice(method: string, params: unknown): void {
    if (method === 'account/login/completed' && this.flow?.catalog === null) {
      this.flow.signIn.completed(params)
    }
  }

  setUsage(accountId: string, usage: AccountUsage | null): void {
    if (usage) this.usage.set(accountId, usage)
    else this.usage.delete(accountId)
  }

  usageOf(accountId: string): AccountUsage | undefined {
    return this.usage.get(accountId)
  }

  /** Войти в аккаунт: в работе - его каталогом, другой - своим; повтор посреди входа - та же ссылка. */
  signIn(accountId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.accounts.find(accountId)) return
      if (this.flow && this.flow.accountId !== accountId) await this.cancelFlow()

      this.flow ??=
        accountId === this.accounts.current
          ? this.startFlow(accountId, this.host.catalog, null)
          : this.ownFlow(accountId)
      await this.flow.signIn.start()
    })
  }

  /** Новый аккаунт - сразу со входом; в список он встанет, когда вход состоится. */
  add(): Promise<void> {
    return this.serial(async () => {
      await this.cancelFlow()
      this.flow = this.ownFlow(await this.accounts.create())
      await this.flow.signIn.start()
    })
  }

  cancel(): Promise<void> {
    return this.serial(() => this.cancelFlow())
  }

  select(accountId: string): Promise<void> {
    return this.serial(() => this.selectNow(accountId))
  }

  forget(accountId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.accounts.find(accountId)) return
      if (this.flow?.accountId === accountId) await this.cancelFlow()

      const wasCurrent = accountId === this.accounts.current

      await this.accounts.forget(accountId)
      this.forgetUsage(accountId)
      if (wasCurrent) await this.selectNow('')
      else this.host.changed()
    })
  }

  /**
   * Выйти из аккаунта строки: из того, что в работе, - его каталогом, после чего разговоры
   * встают на экран входа; из другого - разовым каталогом с его CODEX_HOME. У обычного входа
   * вход стирается и у терминального Codex.
   */
  signOut(accountId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.accounts.find(accountId)) return
      if (this.flow?.accountId === accountId) await this.cancelFlow()

      if (accountId === this.accounts.current) {
        this.outcome = (await this.host.catalog.signOut()) ? null : 'logout-failed'
        this.live = undefined
        await this.host.accountChanged()

        return
      }

      const catalog = this.host.catalogFor(accountId, () => undefined)
      const done = await catalog.signOut().finally(() => catalog.dispose())

      this.outcome = done ? null : 'logout-failed'
      if (done) {
        this.accounts.remember(accountId, { email: '', plan: '' })
        this.forgetUsage(accountId)
      }
      this.host.changed()
    })
  }

  /**
   * Лимиты не текущих аккаунтов - разовым каталогом каждого, не чаще USAGE_MIN_MS на аккаунт;
   * вопрос, который уже идёт, не повторяется. Текущий освежает панель сама.
   */
  refreshOthers(accountIds: readonly string[]): Promise<void> {
    this.othersAsking ??= this.askOthers(accountIds).finally(() => {
      this.othersAsking = null
    })

    return this.othersAsking
  }

  /** Аккаунты в форме панели: в работе - живым ответом Codex, прочие - тем, что запомнили. */
  state(): AccountsState {
    const { current } = this.accounts

    return {
      current,
      accounts: this.accounts.list.map((row) => ({
        ...row,
        ...(row.id === current && this.live
          ? { email: this.live.email, plan: this.live.plan }
          : {}),
        signedIn:
          row.id === current
            ? this.host.cliFound() && this.live !== undefined
              ? this.live !== null
              : null
            : row.email
              ? true
              : null,
        external: false,
      })),
      importable: [],
      signingIn: this.flow?.signIn.isWaiting ? this.flow.accountId : null,
      lastOutcome: this.flow?.signIn.outcome ?? this.outcome,
      usage: Object.fromEntries(this.usage),
    }
  }

  /** Действие с аккаунтами - после предыдущего; сбой одного не держит следующие. */
  private serial(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation, operation)

    this.queue = next.catch(() => undefined)

    return next
  }

  private async askOthers(accountIds: readonly string[]): Promise<void> {
    const now = Date.now()
    const others = accountIds.filter(
      (id) =>
        id !== this.accounts.current &&
        this.accounts.find(id) &&
        !this.flow &&
        now - (this.usageAskedAt.get(id) ?? 0) >= USAGE_MIN_MS,
    )

    await Promise.all(
      others.map(async (id) => {
        const catalog = this.host.catalogFor(id, () => undefined)

        this.usageAskedAt.set(id, now)

        try {
          this.setUsage(id, await catalog.usage())
        } finally {
          await catalog.dispose()
        }
      }),
    )
  }

  private forgetUsage(accountId: string): void {
    this.usage.delete(accountId)
    this.usageAskedAt.delete(accountId)
  }

  private async selectNow(accountId: string): Promise<void> {
    if (!this.accounts.find(accountId)) return

    this.accounts.select(accountId)
    this.live = undefined
    await this.host.accountChanged()
  }

  private async cancelFlow(): Promise<void> {
    const flow = this.flow

    if (!flow) return

    await flow.signIn.cancel()
    this.outcome = flow.signIn.outcome
    await this.endFlow(flow)
  }

  private ownFlow(accountId: string): Flow {
    let flow: Flow | null = null
    const catalog = this.host.catalogFor(accountId, (method, params) => {
      if (method === 'account/login/completed') flow?.signIn.completed(params)
    })

    flow = this.startFlow(accountId, catalog, catalog)

    return flow
  }

  private startFlow(accountId: string, catalog: CodexCatalog, own: CodexCatalog | null): Flow {
    const flow: Flow = {
      accountId,
      catalog: own,
      signIn: new CodexSignIn({
        catalog,
        openUrl: this.host.openUrl,
        changed: this.host.changed,
        signedIn: () => this.serial(() => this.landed(flow)),
      }),
    }

    return flow
  }

  /** Вошли: кто это; новый - в список (дубль - нет), и разговоры - на этот аккаунт. */
  private async landed(flow: Flow): Promise<void> {
    // Вход успели отменить или сменить, пока ждали очереди, - он уже не наш.
    if (this.flow !== flow) return

    const catalog = flow.catalog ?? this.host.catalog
    const account = await catalog.account()
    // У аккаунта в работе почта - живым ответом Codex: запомненная могла устареть.
    const emailOf = (row: { id: string; email: string }) =>
      row.id === this.accounts.current && this.live ? this.live.email : row.email
    const twin =
      account?.email &&
      this.accounts.list.some((row) => row.id !== flow.accountId && emailOf(row) === account.email)

    if (twin) {
      this.outcome = 'twin'
      await this.endFlow(flow)
      await this.accounts.discard(flow.accountId)
      this.host.changed()

      return
    }

    if (account) {
      this.accounts.remember(flow.accountId, { email: account.email, plan: account.plan })
    }

    this.outcome = 'landed'
    await this.endFlow(flow)
    this.accounts.select(flow.accountId)
    this.live = undefined
    await this.host.accountChanged()
  }

  private async endFlow(flow: Flow): Promise<void> {
    if (this.flow === flow) this.flow = null
    if (flow.catalog) await flow.catalog.dispose()
    if (!this.accounts.find(flow.accountId)) await this.accounts.discard(flow.accountId)
    this.host.changed()
  }
}

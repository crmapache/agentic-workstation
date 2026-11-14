import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AccountsState, AccountOutcome } from '@shared/claude-accounts'

import type { ClaudeCli } from '../cli/cli-locator'
import type { Environment } from '../cli/shell-env'
import { runCli } from '../tools/cli-run'
import type { JsonFile } from '../../storage/json-file'
import type { AccAccount } from './acc-import'
import { accMoves, importableOf, readAccAccounts } from './acc-import'
import { destroyDrawer, orphanDrawers } from './account-drawers'
import { environmentFor } from './account-env'
import type { Landing } from './account-landing'
import type { StoredAccount, StoredAccounts } from './account-store'
import { parseStoredAccounts } from './account-store'
import { authStatus } from './auth-status'
import type { AccountIdentity } from './identity-probe'
import { accountKey } from './identity-probe'
import { SignInFlow } from './sign-in-flow'

export type AccountDeps = {
  cli: () => Promise<ClaudeCli | null>
  /** Открыть файл программой по умолчанию: .command - в Терминале. Ошибка - текстом. */
  openPath: (path: string) => Promise<string>
  onChange: () => void
  /** Аккаунт разговоров сменился или перевошёл: процессы держат старый вход в памяти. */
  onCurrentChanged: () => void
  /** Аккаунт забыт: его цифры расхода и папка вопросов уходят вместе с ним. */
  onForgotten: (id: string) => void
}

/**
 * Аккаунты Claude для разговоров. Аккаунт - своё хранилище входа CLI; всё остальное
 * (транскрипты, настройки, MCP, плагины) общее. Вход - в Терминале (`claude auth
 * login`, sign-in-flow.ts), выбранный аккаунт - для всех разговоров. Хранилища
 * amazing-claude-code берутся как есть и не удаляются.
 */
export class AccountService {
  private readonly signedIn = new Map<string, boolean>()
  private importable: AccAccount[] = []
  private readonly flow: SignInFlow
  private lastOutcome: AccountOutcome | null = null
  /** Тариф обычного входа: его CLI говорит честно, а записи в реестре у этого входа нет. */
  private defaultPlan = ''
  /** Кто в обычном входе, со слов самого входа (круг экрана); null - не спрашивали или вышли. */
  private defaultWho: AccountIdentity | null = null

  /**
   * Хранилище аккаунта заменено повторным входом: живые процессы на нём держат удалённое
   * хранилище и должны подняться заново, как освободятся (ход не рвётся - подписка та же).
   * Ставит панель (PanelDesk.start), как путь к CLI у CliAccess.
   */
  renewed: (id: string) => void = () => undefined

  private constructor(
    private stored: StoredAccounts,
    private readonly file: JsonFile<StoredAccounts>,
    /** Папка хранилищ: там же скрипты Терминала и одноразовые папки проб. */
    readonly dir: string,
    private readonly deps: AccountDeps,
  ) {
    this.flow = new SignInFlow({
      dir,
      cli: deps.cli,
      openPath: deps.openPath,
      records: () => this.stored.accounts,
      statusOf: (drawer) => this.statusOf(drawer),
      drawerOf: (id) => this.drawerOf(id),
      signedInAgain: (id, plan) => this.signedInAgain(id, plan),
      land: (draft, landing, plan) => this.land(draft, landing, plan),
      outcome: (outcome) => this.noteOutcome(outcome),
    })
  }

  /** Реестр с диска; хранилища брошенных входов (IDE закрыли посреди входа) - в мусор. */
  static async load(file: JsonFile<StoredAccounts>, dir: string, deps: AccountDeps) {
    const service = new AccountService(parseStoredAccounts(await file.read()), file, dir, deps)
    const known = new Set(service.stored.accounts.map((account) => account.drawer))

    for (const drawer of await orphanDrawers(dir, known)) await destroyDrawer(dir, drawer)

    // ACC мог увести взятый аккаунт в новое хранилище, пока IDE была закрыта.
    service.importable = await readAccAccounts()
    service.followAcc()

    return service
  }

  get view(): Omit<AccountsState, 'usage'> {
    const ordinary = {
      id: '',
      alias: this.stored.defaultAlias,
      email: this.defaultWho?.email ?? '',
      plan: '',
      external: false,
    }

    return {
      current: this.stored.current,
      accounts: [ordinary, ...this.stored.accounts].map((account) => ({
        id: account.id,
        alias: account.alias,
        email: account.email,
        plan: account.id === '' ? this.defaultPlan : account.plan,
        external: account.external,
        signedIn: this.signedIn.get(account.id) ?? null,
      })),
      importable: importableOf(
        this.importable,
        this.stored.accounts,
        this.defaultWho && accountKey(this.defaultWho.email, this.defaultWho.orgUuid),
      ).map(({ sourceId, alias, email, plan }) => ({ sourceId, alias, email, plan })),
      signingIn: this.flow.signingIn,
      lastOutcome: this.lastOutcome,
    }
  }

  /** Выбранный аккаунт разговоров. */
  get current(): string {
    return this.stored.current
  }

  /** Добавленные аккаунты как записаны - для круга экрана (переписывание, склейка). */
  records(): readonly StoredAccount[] {
    return this.stored.accounts
  }

  /** Хранилище входа аккаунта: null - обычный вход, undefined - такого аккаунта нет. */
  drawerFor(id: string): string | null | undefined {
    return id === '' ? null : this.find(id)?.drawer
  }

  /** Окружение CLI выбранного аккаунта. */
  envFor(base: Environment): Environment {
    return environmentFor(base, this.drawerOf(this.stored.current))
  }

  /** Вошёл ли CLI в аккаунт в работе - для экрана входа панели (один процесс, не все). */
  async checkCurrent(): Promise<void> {
    const id = this.stored.current
    const status = await this.statusOf(this.drawerOf(id))

    // Без authMethod CLI не ответил вовсе (сбой, таймаут): это не «не вошёл».
    if (!status?.method) return

    this.signedIn.set(id, status.loggedIn)
    if (status.loggedIn && id === '') this.patchDefault(status.plan)

    this.deps.onChange()
  }

  /** Спросить у каждого хранилища, вошёл ли CLI, и перечитать аккаунты ACC. */
  async refresh(): Promise<void> {
    this.importable = await readAccAccounts()
    this.followAcc()

    for (const id of ['', ...this.stored.accounts.map((account) => account.id)]) {
      const status = await this.statusOf(this.drawerOf(id))

      // Без authMethod CLI не ответил (сбой, таймаут): это не «не вошёл» - экран входа ни при чём.
      if (status?.method) this.signedIn.set(id, status.loggedIn)
      if (status && id === '' && status.loggedIn) this.patchDefault(status.plan)
    }

    this.deps.onChange()
  }

  /** Новый аккаунт: пустое хранилище, черновик и Терминал с входом в него. */
  add(): Promise<void> {
    const id = randomBytes(8).toString('hex')

    return this.flow.begin(id, async () => {
      const drawer = join(this.dir, `s-${randomBytes(8).toString('hex')}`)

      await mkdir(drawer, { recursive: true, mode: 0o700 })

      return {
        id,
        drawer,
        alias: '',
        email: '',
        orgUuid: '',
        plan: '',
        addedAt: Date.now(),
        external: false,
      }
    })
  }

  /** Войти заново в существующий аккаунт (вход истёк). */
  signInAgain(id: string): Promise<void> {
    if (id !== '' && !this.find(id)) throw new Error(`Аккаунта ${id} нет`)

    return this.flow.begin(id, () => Promise.resolve(null))
  }

  cancelSignIn(): Promise<void> {
    return this.flow.cancel()
  }

  select(id: string): void {
    if (id !== '' && !this.find(id)) throw new Error(`Аккаунта ${id} нет`)
    if (id === this.stored.current) return

    this.stored = { ...this.stored, current: id }
    this.save()
    this.deps.onCurrentChanged()
  }

  /** Чем кончилось действие со входом - плашкой на экране аккаунтов. */
  noteOutcome(outcome: AccountOutcome | null): void {
    this.lastOutcome = outcome
    this.deps.onChange()
  }

  /** Кто в обычном входе - ответ самого входа из круга экрана: карточка называет его почтой. */
  noteDefaultIdentity(who: AccountIdentity | null): void {
    if (who?.email === this.defaultWho?.email && who?.orgUuid === this.defaultWho?.orgUuid) return

    this.defaultWho = who
    this.deps.onChange()
  }

  /** Имя от человека; у обычного входа записи нет - имя лежит в реестре отдельно. */
  rename(id: string, alias: string): void {
    if (id !== '') return this.update(id, { alias: alias.trim() })

    this.stored = { ...this.stored, defaultAlias: alias.trim() }
    this.save()
  }

  /**
   * Переписать запись под аккаунт, который её хранилище держит на деле (refile в ACC): на
   * месте - id, хранилище и разговоры на нём остаются, меняется только имя записи.
   */
  async refile(id: string, who: AccountIdentity): Promise<void> {
    const record = this.find(id)

    if (!record || !who.email) return

    const status = await this.statusOf(record.drawer)
    const plan = status?.loggedIn && status.plan ? status.plan : record.plan

    this.update(id, { email: who.email, orgUuid: who.orgUuid, plan })
  }

  /** Взять аккаунт amazing-claude-code: его хранилище, без повторного входа. */
  import(sourceId: string): void {
    const source = this.importable.find((account) => account.sourceId === sourceId)

    if (!source || this.stored.accounts.some((account) => account.drawer === source.drawer)) return

    const id = randomBytes(8).toString('hex')
    const { drawer, alias, email, orgUuid, plan } = source
    const record = { id, drawer, alias, email, orgUuid, plan, addedAt: Date.now(), external: true }

    this.stored = { ...this.stored, accounts: [...this.stored.accounts, record] }
    this.save()
    // Вошёл ли CLI в это хранилище - сразу, а не до следующего открытия экрана.
    void this.statusOf(drawer).then((status) => {
      if (status) this.signedIn.set(id, status.loggedIn)

      this.deps.onChange()
    })
  }

  /** Забыть аккаунт. Своё хранилище уничтожается с записью Keychain; чужое (ACC) остаётся. */
  async forget(id: string): Promise<void> {
    const account = this.find(id)

    if (!account) return

    const wasCurrent = this.stored.current === id

    this.stored = {
      ...this.stored,
      current: wasCurrent ? '' : this.stored.current,
      accounts: this.stored.accounts.filter((entry) => entry.id !== id),
    }
    this.signedIn.delete(id)
    this.save()
    this.deps.onForgotten(id)

    if (!account.external) await destroyDrawer(this.dir, account.drawer)
    if (wasCurrent) this.deps.onCurrentChanged()
  }

  /**
   * Выйти из обычного входа Claude Code. `auth logout` отзывает вход на стороне
   * Anthropic - на всех машинах; окно спрашивает об этом заранее. Не вышло - вход жив,
   * и экран говорит об этом, а не рисует «не вошёл».
   */
  async logout(): Promise<void> {
    const cli = await this.deps.cli()

    if (!cli) return

    const env = environmentFor(cli.env, null)
    const run = await runCli({ ...cli, env }, ['auth', 'logout'], homedir())

    if (run.code !== 0) {
      console.warn('[claude] выход не прошёл:', run.code, run.stderr.trim())

      return this.noteOutcome('logout-failed')
    }

    this.signedIn.set('', false)
    this.defaultWho = null
    this.noteOutcome(null)

    if (this.stored.current === '') this.deps.onCurrentChanged()
  }

  /** Выход из IDE посреди входа: Терминал гасится, черновик - в мусор. */
  dispose(): Promise<void> {
    return this.flow.cancel()
  }

  /** Перевошли в существующее хранилище: процессы аккаунта в работе держат старый вход. */
  private signedInAgain(id: string, plan: string) {
    this.signedIn.set(id, true)
    if (id === '') this.patchDefault(plan)
    else this.update(id, { plan: plan || this.find(id)?.plan || '' })

    if (id === this.stored.current) this.deps.onCurrentChanged()
  }

  /**
   * Вход в черновик лёг. renew - повторный вход в аккаунт из списка: запись остаётся (id,
   * имя, выбор модели), под ней - новое хранилище, старое своё уничтожается, живые процессы
   * переподнимаются. add - новая строка (и, если надо, переписанная соседняя).
   */
  private land(draft: StoredAccount, landing: Exclude<Landing, { kind: 'twin' }>, plan: string) {
    const { who } = landing
    const named = { email: who.email, orgUuid: who.orgUuid, plan }

    if (landing.kind === 'renew') {
      const held = this.find(landing.held)

      if (!held) return

      this.update(held.id, { ...named, drawer: draft.drawer, external: false })
      this.signedIn.set(held.id, true)

      if (!held.external) void destroyDrawer(this.dir, held.drawer)

      return this.renewed(held.id)
    }

    if (landing.refile) void this.refile(landing.refile.id, landing.refile.who)

    this.stored = { ...this.stored, accounts: [...this.stored.accounts, { ...draft, ...named }] }
    this.signedIn.set(draft.id, true)
    this.save()
  }

  /**
   * Записи на хранилищах, которые ACC бросил, переходят туда, где ACC держит их аккаунт теперь
   * (acc-import.ts). Живые процессы на старом хранилище поднимаются заново, как после повторного
   * входа: ACC вот-вот уберёт старую папку.
   */
  private followAcc() {
    for (const move of accMoves(this.stored.accounts, this.importable)) {
      this.update(move.id, { drawer: move.drawer })
      this.signedIn.delete(move.id)
      this.renewed(move.id)
    }
  }

  private async statusOf(drawer: string | null) {
    const cli = await this.deps.cli()

    return cli ? authStatus({ ...cli, env: environmentFor(cli.env, drawer) }, homedir()) : null
  }

  private patchDefault(plan: string) {
    this.signedIn.set('', true)
    this.defaultPlan = plan
  }

  private find(id: string) {
    return this.stored.accounts.find((account) => account.id === id)
  }

  private drawerOf(id: string): string | null {
    return this.find(id)?.drawer ?? null
  }

  private update(id: string, change: Partial<StoredAccount>) {
    this.stored = {
      ...this.stored,
      accounts: this.stored.accounts.map((account) =>
        account.id === id ? { ...account, ...change } : account,
      ),
    }
    this.save()
  }

  private save() {
    this.deps.onChange()
    this.file.write(this.stored).catch((error: unknown) => {
      console.warn('[claude] аккаунты не сохранились:', error)
    })
  }
}

import { rm, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AccountCapability } from '@shared/claude-panel'

import type { ClaudeCli } from '../cli/cli-locator'
import { environmentFor } from './account-env'
import type { AccountService } from './account-service'
import type { TwinRow } from './account-twins'
import { twinMerges, mislabelled } from './account-twins'
import type { AuthStatus } from './auth-status'
import { authStatus } from './auth-status'
import { accountKey, probeIdentity } from './identity-probe'
import { isolationVerdict } from './isolation-proof'

/** Как часто экран аккаунтов перепроверяет пробу и дубли: каждая - процессы CLI. */
const UPKEEP_MS = 10 * 60 * 1000

export type UpkeepDeps = {
  accounts: () => AccountService
  cli: () => Promise<ClaudeCli | null>
  /** Папка хранилищ: там же одноразовые папки проб. */
  dir: () => string
  /** Сменить аккаунт, не прерывая ход: та же подписка под другой строкой. */
  gently: (change: () => Promise<void> | void) => Promise<void>
  onChange: () => void
}

/**
 * Фоновая забота об аккаунтах, пока открыт их экран (круг AccountDesk в ACC): проба, умеет
 * ли CLI держать два входа порознь (и почему нет), затем строки, чьё хранилище держит не тот
 * аккаунт, переписываются, и дубли склеиваются - по свежим ответам самих хранилищ. Сначала
 * переписывание: пару, которую оно оставит, склейка видит в том же круге. Не чаще раза в
 * десять минут: каждый ответ - процесс CLI.
 */
export class AccountUpkeep {
  capability: AccountCapability = 'unknown'
  private lastRun = 0
  private running = false

  constructor(private readonly deps: UpkeepDeps) {}

  async run(force = false): Promise<void> {
    if (this.running || (!force && Date.now() - this.lastRun < UPKEEP_MS)) return

    const cli = await this.deps.cli()

    if (!cli) return

    this.running = true
    this.lastRun = Date.now()

    try {
      this.capability = await this.probe(cli)
      this.deps.onChange()

      if (this.deps.accounts().view.signingIn === null) await this.tidy(cli)
    } catch (error) {
      console.warn('[claude] проба аккаунтов не прошла:', error)
    } finally {
      this.running = false
    }
  }

  /** CLI без хранилища, живой вход и заведомо пустое хранилище - и вердикт по ним. */
  private async probe(cli: ClaudeCli): Promise<AccountCapability> {
    const ask = (drawer: string | null) =>
      authStatus({ ...cli, env: environmentFor(cli.env, drawer) }, homedir())
    const plain = await ask(null)
    const reference = plain.loggedIn ? plain : await this.liveAdded(ask)
    const empty = await mkdtemp(join(this.deps.dir(), 'probe-'))

    try {
      return isolationVerdict(plain, reference, await ask(empty))
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  }

  /** Опора пробы, когда из обычного входа вышли: добавленный вход, который отвечает «вошёл». */
  private async liveAdded(ask: (drawer: string | null) => Promise<AuthStatus>) {
    const accounts = this.deps.accounts()
    const rows = accounts.view.accounts.filter((row) => row.id !== '' && row.signedIn === true)
    const ordered = [
      ...rows.filter((row) => row.id === accounts.current),
      ...rows.filter((row) => row.id !== accounts.current),
    ]

    for (const row of ordered) {
      const drawer = accounts.drawerFor(row.id)
      const status = drawer ? await ask(drawer) : null

      if (status?.loggedIn) return status
    }

    return null
  }

  /**
   * Каждое живое хранилище спрашивается, чей в нём вход (рукопожатием в одноразовом конфиге),
   * - и по этим ответам строки переписываются и склеиваются. Живость - ответ «вошёл» из
   * только что прошедшего обхода экрана (accounts.refresh); не ответившее не трогается.
   */
  private async tidy(cli: ClaudeCli) {
    const accounts = this.deps.accounts()
    const dir = this.deps.dir()
    const isLive = (id: string) =>
      accounts.view.accounts.find((row) => row.id === id)?.signedIn === true
    const defaultLive = isLive('')
    const defaultWho = defaultLive ? await probeIdentity(cli, null, dir) : null
    // Не ответил, хотя вошёл, - прежнее имя остаётся: «не сказал» - не «вышел».
    if (defaultWho || !defaultLive) accounts.noteDefaultIdentity(defaultWho)
    const rows: TwinRow[] = []

    for (const record of accounts.records()) {
      const live = isLive(record.id)

      rows.push({
        id: record.id,
        who: live ? await probeIdentity(cli, record.drawer, dir) : null,
        live,
        filedAs: accountKey(record.email, record.orgUuid),
        addedAt: record.addedAt,
        alias: record.alias,
      })
    }

    for (const { id, who } of mislabelled(rows)) await accounts.refile(id, who)

    for (const merge of twinMerges(
      { who: defaultWho, live: defaultLive },
      rows,
      accounts.current,
    )) {
      if (merge.alias !== null) accounts.rename(merge.keep, merge.alias)

      await this.deps.gently(async () => {
        if (accounts.current === merge.drop) accounts.select(merge.keep)

        await accounts.forget(merge.drop)
      })
    }
  }
}

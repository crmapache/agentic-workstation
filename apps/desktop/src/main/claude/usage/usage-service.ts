import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { AccountUsage } from '@shared/account-usage'

import type { ClaudeCli } from '../cli/cli-locator'
import type { CliProcess } from '../cli/cli-process'
import { parseUsage } from './usage-parse'
import type { UsageAnswer } from './usage-probe'
import { probeUsage } from './usage-probe'
import { USAGE_DIR, LIVE_GAP_MS, PROBE_GAP_MS, DEFAULT_USAGE_NAME } from './usage.constants'

export type UsageDeps = {
  cli: () => Promise<ClaudeCli | null>
  /** Хранилище входа аккаунта: null - обычный вход, undefined - такого аккаунта нет. */
  drawerOf: (accountId: string) => string | null | undefined
  /** Живой процесс разговора на этом аккаунте. */
  liveProcess: (accountId: string) => CliProcess | null
  /** Папка аккаунтов: внутри неё - конфиги вопросов о расходе. */
  dir: string
  onChange: () => void
}

/**
 * Лимиты подписки по аккаунтам. Источники - по свежести и цене: живой разговор после
 * хода (CLI знает расход своего аккаунта из заголовков ответов модели), иначе свой
 * процесс CLI в постоянной папке конфига аккаунта (usage-probe.ts). Каждый аккаунт
 * спрашивается не чаще своего шага: сервер отбивает частые вопросы. Из двух ответов
 * остаётся снятый с сервера позже - отставший не опускает и не поднимает цифры.
 */
export class UsageService {
  private readonly usage = new Map<string, AccountUsage>()
  private readonly askedAt = new Map<string, number>()
  private readonly asking = new Map<string, Promise<void>>()
  /**
   * Процессы, которые уже сделали ход. Только им верим без снимка сервера: до хода у
   * процесса нет своих заголовков, и подставленный ответ взялся бы из общего кэша -
   * а там цифры того аккаунта, чей процесс писал его последним.
   */
  private readonly turned = new WeakSet<CliProcess>()

  constructor(private readonly deps: UsageDeps) {}

  get view(): Record<string, AccountUsage> {
    return Object.fromEntries(this.usage)
  }

  /** Освежить цифры аккаунтов: каждый - не чаще своего шага; ждёт ответов. */
  async refresh(accountIds: readonly string[]): Promise<void> {
    await Promise.all(accountIds.map((id) => this.refreshOne(id)))
  }

  /** Ход кончился или CLI сказал о лимите: его процесс знает расход своего аккаунта. */
  fromProcess(accountId: string, process: CliProcess): void {
    this.turned.add(process)
    void this.ask(accountId, LIVE_GAP_MS, () => this.askProcess(process))
  }

  /** Аккаунт забыт: цифры и папка его вопросов - тоже. */
  async forget(accountId: string): Promise<void> {
    this.usage.delete(accountId)
    this.askedAt.delete(accountId)
    this.deps.onChange()
    await rm(this.configDir(accountId), { recursive: true, force: true })
  }

  private refreshOne(accountId: string): Promise<void> {
    const live = this.deps.liveProcess(accountId)

    if (live && this.turned.has(live)) {
      return this.ask(accountId, LIVE_GAP_MS, () => this.askProcess(live))
    }

    const drawer = this.deps.drawerOf(accountId)

    if (drawer === undefined) return Promise.resolve()

    return this.ask(accountId, PROBE_GAP_MS, async () => {
      const cli = await this.deps.cli()

      return cli ? probeUsage(cli, drawer, this.configDir(accountId)) : null
    })
  }

  /** Один вопрос на аккаунт за раз и не чаще gap; ответ - в цифры аккаунта. */
  private ask(
    accountId: string,
    gap: number,
    run: () => Promise<UsageAnswer | null>,
  ): Promise<void> {
    const running = this.asking.get(accountId)

    if (running) return running
    if (Date.now() - (this.askedAt.get(accountId) ?? 0) < gap) return Promise.resolve()

    this.askedAt.set(accountId, Date.now())

    const task = run()
      .then((answer) => {
        if (answer) this.accept(accountId, answer)
      })
      .catch((error: unknown) => console.warn('[claude] расход не узнали:', error))
      .finally(() => this.asking.delete(accountId))

    this.asking.set(accountId, task)

    return task
  }

  private async askProcess(process: CliProcess): Promise<UsageAnswer | null> {
    const parsed = parseUsage(await process.control({ subtype: 'get_usage' }).catch(() => null))

    return parsed && { parsed, fetchedAt: Date.now() }
  }

  private accept(accountId: string, { parsed, fetchedAt }: UsageAnswer) {
    const known = this.usage.get(accountId)

    if (known && known.fetchedAt > fetchedAt) return

    this.usage.set(accountId, { windows: parsed.windows, extra: parsed.extra, fetchedAt })
    this.deps.onChange()
  }

  private configDir(accountId: string) {
    return join(this.deps.dir, USAGE_DIR, accountId || DEFAULT_USAGE_NAME)
  }
}

import type { ClaudeState, RefusedModes, PermissionMode, ConversationOptions } from '@shared/claude'
import { modeModel } from '@shared/claude'
import type { AccountsState } from '@shared/claude-accounts'
import type { CliSearch, CarryOnReason, PanelTerminalCommand } from '@shared/claude-panel'
import type { PanelPrefs } from '@shared/claude-prefs'

import type { ClaudeService } from '../claude-service'
import { AccountChoices } from '../accounts/account-choices'
import { AccountModels } from '../accounts/account-models'
import { AccountUpkeep } from '../accounts/account-upkeep'
import { writeTerminalCommand } from '../accounts/design-login'
import type { CliMessage } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import { claudeOf } from '../conversation/claude-conversation'
import { NO_REFUSALS, withRefusal } from '../settings/mode-refusals'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { AccountMoves } from './account-moves'
import { AsideDesk } from './aside-desk'
import { CarryOnDesk } from './carry-on-desk'
import { foldModLine, withoutToast } from './mod-lines'
import { ModelDesk } from './model-desk'
import type { PanelHooks } from './panel-hooks'

/** Минутный круг: продолжения, у которых не было своего таймера (вкладка была занята). */
const ROUND_MS = 60_000

/** Выход в Терминале: как часто и сколько спрашивать вход аккаунта, пока не выйдет. */
const SIGN_OUT_POLL_MS = 3_000
const SIGN_OUT_WATCH_MS = 2 * 60_000

/**
 * Служебные возможности панели Claude Code поверх разговоров (как в ACC): вопрос сбоку,
 * моды CLI, быстрый режим и судьба выбора модели, продолжение оборванной работы, переезд
 * на выбранный аккаунт, вход в Claude Design, путь к CLI. Разговор зовёт сюда через
 * PanelHooks; окно - через каналы claudePanel:* (main/ipc/claude-panel-handlers.ts).
 */
export class PanelDesk implements PanelHooks {
  readonly aside = new AsideDesk((id) => this.service.runtime(id))
  readonly carryOn = new CarryOnDesk({
    runtimeOf: (id) => this.runtimeOf(id),
    refusedUntil: (account) => this.refused.get(account) ?? null,
    noteRefusal: (account, until) => this.noteRefusal(account, until),
    noteAnswered: (account) => this.noteRefusal(account, null),
  })
  readonly models = new ModelDesk(() => this.service.getState().models)
  readonly moves = new AccountMoves({
    runtimes: () => this.runtimes(),
    currentAccount: () => this.service.accounts.current,
    carryOn: this.carryOn,
  })
  readonly upkeep = new AccountUpkeep({
    accounts: () => this.service.accounts,
    cli: () => this.service.cli.locate(),
    dir: () => this.service.accounts.dir,
    gently: (change) => this.moves.gently(change),
    onChange: () => this.service.scheduleBroadcast(),
  })
  /** Каталоги моделей по аккаунтам и модель вкладки к аккаунту до подъёма процесса. */
  readonly accountModels = new AccountModels({
    accounts: () => this.service.accounts,
    cli: () => this.service.cli.locate(),
    prefs: () => this.service.settings.prefs,
    choiceOf: (id) => this.choices?.of(id)?.model,
  })
  /** Режимы, в которые CLI отказался переходить (settings/mode-refusals.ts). */
  refusedModes: RefusedModes = NO_REFUSALS
  /** Лимит отказал аккаунту до этого момента (мс). */
  private readonly refused = new Map<string, number>()
  /** Процесс, чьи моды сейчас на экране вкладки: его выход их снимает. */
  private readonly modsOwner = new WeakMap<ConversationRuntime, CliProcess | null>()
  private round: NodeJS.Timeout | null = null
  /** Чем каждый аккаунт оставили; грузится на старте. */
  private choices: AccountChoices | null = null

  constructor(
    private readonly service: ClaudeService,
    private readonly openPath: (path: string) => Promise<string>,
  ) {}

  /** Старт IDE: найти CLI, спросить вход аккаунта в работе (экран входа), завести круг. */
  async start(): Promise<void> {
    this.round ??= setInterval(() => this.dueRound(), ROUND_MS)
    this.round.unref()
    // Путь к CLI, названный руками, - первым на каждом поиске (cli/cli-path.ts проверит).
    this.service.cli.configured = () => this.service.settings.prefs.cliPath
    this.service.accounts.renewed = (id) => this.accountRenewed(id)
    this.choices ??= await AccountChoices.load(this.service.accounts.dir)

    if (await this.service.cli.locate()) await this.service.accounts.checkCurrent()
  }

  line = (runtime: ConversationRuntime, message: CliMessage): boolean => {
    if (this.aside.progress(message)) return true
    if (message.type === 'conversation_reset') this.aside.forget(runtime.meta.id)

    const fold = foldModLine(runtime.meta.mods, message, Date.now())

    if (fold) {
      if (fold.mods !== runtime.meta.mods) {
        this.modsOwner.set(runtime, claudeOf(runtime).process)
        runtime.update({ mods: fold.mods })
        this.expireToast(runtime)
      }

      if (fold.log) {
        claudeOf(runtime).feed.builder.addNotice('mod', fold.log.text, { subject: fold.log.plugin })
        claudeOf(runtime).feed.schedule()
      }

      return true
    }

    this.carryOn.observe(runtime, message)
    this.models.observe(runtime, message)
    this.accountModels.heard(runtime, message)

    return false
  }

  launching = (runtime: ConversationRuntime, accountId: string): void =>
    this.accountModels.launching(runtime, accountId)

  /**
   * Вход аккаунта заменён повторным входом (старое хранилище удалено): живые процессы на
   * нём поднимаются заново, как освободятся - ход не рвётся, подписка та же (relaunchOn в ACC).
   */
  accountRenewed(id: string): void {
    this.accountModels.forget(id)

    for (const runtime of this.runtimes()) {
      if (runtime.accountId === id && claudeOf(runtime).process?.isAlive) runtime.restartSession()
    }
  }

  afterResult = (runtime: ConversationRuntime, result: CliMessage): void => {
    void this.moves
      .afterTurn(runtime)
      .then(() => this.carryOn.afterResult(runtime, result, Date.now()))
  }

  said = (runtime: ConversationRuntime, auto: CarryOnReason | null): void => {
    // Человек (или его очередь) сказал сам: продолжение панели больше не нужно.
    if (!auto) this.carryOn.drop(runtime.meta.id)
  }

  exited = (runtime: ConversationRuntime, process: CliProcess): void => {
    // Моды живут в процессе: он ушёл - строки «мод держит окно» говорили бы о коде, которого нет.
    if (runtime.meta.mods && this.modsOwner.get(runtime) === process)
      runtime.update({ mods: undefined })
  }

  /** Отказ CLI перейти в режим - в память панели: модель - та, на которой отказали. */
  modeRefused = (runtime: ConversationRuntime, mode: PermissionMode): void => {
    const next = withRefusal(this.refusedModes, mode, modeModel(runtime.meta))

    if (next === this.refusedModes) return

    this.refusedModes = next
    this.service.scheduleBroadcast()
  }

  /** Выбор модели и усилия: судьба выбора, быстрый режим, память аккаунта. */
  options(runtime: ConversationRuntime, options: ConversationOptions): ConversationOptions {
    if (options.model !== undefined || options.effort !== undefined) {
      this.choices?.remember(this.service.accounts.current, {
        ...(options.model !== undefined && { model: options.model }),
        ...(options.effort !== undefined && { effort: options.effort }),
      })
    }

    return this.models.picked(runtime, options)
  }

  /**
   * С чего стартует новая вкладка: закреплённое в Settings, иначе чем оставили аккаунт в
   * работе, иначе как выбранная вкладка (tabs/new-tab.ts).
   */
  newTabPrefs(prefs: PanelPrefs): PanelPrefs {
    const choice = this.choices?.of(this.service.accounts.current)

    return {
      ...prefs,
      newTabModel: prefs.newTabModel ?? choice?.model ?? null,
      newTabEffort: prefs.newTabEffort ?? choice?.effort ?? null,
    }
  }

  /** Аккаунт в работе сменился: переезд (accounts.select, forget, logout, вход). */
  accountChanged(): void {
    this.moves.followCurrent()
  }

  /** Что панель знает об аккаунтах сверх реестра: проба и отказы лимита. */
  accountFacts(): Pick<AccountsState, 'capability' | 'refusedUntil'> {
    return { capability: this.upkeep.capability, refusedUntil: Object.fromEntries(this.refused) }
  }

  /** Выйти из обычного входа - и перейти на соседний вошедший аккаунт, если он есть. */
  async logout(): Promise<void> {
    const { accounts } = this.service
    const next = accounts.view.accounts.find((row) => row.id !== '' && row.signedIn === true)

    await accounts.logout()

    if (next && accounts.current === '' && accounts.view.accounts[0]?.signedIn === false) {
      accounts.select(next.id)
    }
  }

  /**
   * Вход в Claude Design или выход - Терминал в хранилище аккаунта в работе (как в ACC).
   * После выхода вход спрашивается заново, пока Терминал открыт: экран входа встанет сам.
   */
  async terminalCommand(command: PanelTerminalCommand): Promise<ClaudeState> {
    const { accounts } = this.service
    const cli = await this.service.cli.locate()
    const drawer = accounts.drawerFor(accounts.current)

    if (!cli) return this.service.getState()
    if (drawer === undefined) return this.failed('design-no-account')

    const script = await writeTerminalCommand(accounts.dir, cli.binary, drawer, command)
    const failure = await this.openPath(script)

    if (failure) {
      console.warn('[claude] Терминал для команды CLI не открылся:', command, failure)

      return this.failed('open-failed')
    }

    if (command === 'logout') this.watchSignOut()

    return this.service.getState()
  }

  /** Путь к CLI руками: проверить, запомнить и искать заново. */
  async setCliPath(path: string): Promise<{ state: ClaudeState; search: CliSearch }> {
    this.service.setPrefs({ cliPath: path.trim() })
    await this.service.recheckCli()

    if (this.service.cli.status === 'found') await this.service.accounts.checkCurrent()

    return { state: this.service.getState(), search: this.service.cli.search }
  }

  /** Выход идёт в Терминале: спрашивать вход аккаунта, пока не выйдет (или две минуты). */
  private watchSignOut() {
    const started = Date.now()
    const timer = setInterval(() => {
      const { accounts } = this.service
      const row = accounts.view.accounts.find((account) => account.id === accounts.current)

      if (row?.signedIn === false || Date.now() - started > SIGN_OUT_WATCH_MS) {
        clearInterval(timer)
      } else {
        void accounts.checkCurrent()
      }
    }, SIGN_OUT_POLL_MS)

    timer.unref()
  }

  private failed(outcome: 'design-no-account' | 'open-failed') {
    this.service.accounts.noteOutcome(outcome)

    return this.service.getState()
  }

  /** Всплывашка мода гаснет в свой срок - в состоянии вкладки, а не только на экране. */
  private expireToast(runtime: ConversationRuntime) {
    const toast = runtime.meta.mods?.toast

    if (!toast) return

    const timer = setTimeout(
      () => {
        const next = withoutToast(runtime.meta.mods, Date.now())

        if (next !== runtime.meta.mods) runtime.update({ mods: next })
      },
      Math.max(0, toast.until - Date.now()),
    )

    timer.unref()
  }

  /** Лимит отказал аккаунту до until (null - отказ прошёл). */
  noteRefusal(account: string, until: number | null) {
    const had = this.refused.has(account)

    if (until !== null && until > Date.now()) this.refused.set(account, until)
    else this.refused.delete(account)

    if (had !== this.refused.has(account)) this.service.scheduleBroadcast()
  }

  private dueRound() {
    for (const id of this.carryOn.due(Date.now())) {
      const runtime = this.runtimeOf(id)

      if (runtime) this.carryOn.sayNext(runtime, Date.now())
      else this.carryOn.forget(id)
    }

    // Отказы лимита, чей срок прошёл, снимаются с аккаунтов.
    for (const [account, until] of this.refused)
      if (until <= Date.now()) this.noteRefusal(account, null)
  }

  private runtimes(): ConversationRuntime[] {
    return this.service
      .getState()
      .conversations.flatMap((conversation) => this.runtimeOf(conversation.id) ?? [])
  }

  private runtimeOf(id: string): ConversationRuntime | null {
    try {
      return this.service.runtime(id)
    } catch {
      return null
    }
  }
}

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'

import type { AcpSignInStep, AccountOutcome } from '@shared/accounts'

import { SPAWN_DETACHED } from '../platform'
import { ProcessGroup } from '../process/process-group'
import { launchTarget } from '../windows/cmd-launch'
import type { AcpCli, AcpLaunch } from './acp-agent'

/** Сколько ждать входа: человек ищет пароль, проходит двухфакторную проверку. */
const SIGN_IN_TIMEOUT_MS = 15 * 60_000

/**
 * Код устройства (Kimi): из адреса (`user_code=0CQM-7010`), иначе из строки «enter code:
 * 0CQM-7010». Двоеточие обязательно: в «/code/authorize_device» тоже есть слово code.
 */
const CODE_PATTERN = /user_code=([A-Z0-9][A-Z0-9-]{3,})|\bcode:\s*([A-Z0-9][A-Z0-9-]{3,})/i

/** Кто вошёл - строкой CLI («Logged in as mzpizote@gmail.com.»). */
const ACCOUNT_PATTERN = /logged in as\s+(\S+?)\.?\s*$/im

/** Чем кончился вход: вошли (и кто), отменили, не дождались, CLI отказал. */
export type SignInEnd = { outcome: AccountOutcome; account: string }

/**
 * Вход агента ACP: как его поднять, ждёт ли он код со страницы входа (`agy`) и как выглядит адрес
 * страницы входа - другая ссылка в выводе (о новой версии CLI) страницей входа не станет.
 */
export type AcpLogin = AcpLaunch & { needsCode: boolean; urlPattern: RegExp }

/**
 * Вход в агента ACP силами самого CLI (ADR 0092): `agy acp --login` печатает адрес Google и
 * ждёт код со страницы `antigravity.google/oauth-callback` в stdin; `kimi login` печатает
 * адрес и код устройства и ждёт, пока человек подтвердит вход в браузере. IDE только
 * показывает адрес и код и передаёт код человека - токенов она не видит.
 */
export class AcpSignIn {
  step: AcpSignInStep | null = null
  private child: ChildProcessWithoutNullStreams | null = null
  private group: ProcessGroup | null = null
  private output = ''
  private ending: 'cancelled' | 'timeout' | null = null

  /** step - адрес и код появились или поменялись; end - вход кончился. */
  constructor(
    private readonly onStep: (step: AcpSignInStep | null) => void,
    private readonly onEnd: (end: SignInEnd) => void,
  ) {}

  get isRunning(): boolean {
    return this.child !== null
  }

  start(cli: AcpCli, login: AcpLogin): void {
    if (this.child) return

    this.ending = null
    this.output = ''
    this.step = null

    // Kimi из npm на Windows - обёртка kimi.cmd: её - через cmd.exe.
    const target = launchTarget(cli.binary, login.args)
    const child = spawn(target.file, target.args, {
      env: { ...cli.env, ...login.env, NO_BROWSER: 'true' },
      detached: SPAWN_DETACHED,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsVerbatimArguments: target.verbatim,
    })
    const timer = setTimeout(() => this.cancel('timeout'), SIGN_IN_TIMEOUT_MS)

    this.child = child
    this.group = new ProcessGroup(child)
    timer.unref()

    const read = (chunk: Buffer) => {
      this.output = (this.output + chunk.toString('utf8')).slice(-8_000)
      this.parse(login)
    }

    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.stdin.on('error', () => undefined)
    child.on('close', (code) => {
      clearTimeout(timer)
      this.child = null
      this.group = null
      this.step = null
      this.onStep(null)

      const account = ACCOUNT_PATTERN.exec(this.output)?.[1] ?? ''
      const outcome: AccountOutcome = code === 0 ? 'landed' : (this.ending ?? 'sign-in-failed')

      this.onEnd({ outcome, account })
    })
  }

  /** Код со страницы входа - в stdin CLI (`agy`). */
  submitCode(code: string): void {
    const clean = code.trim()

    if (!this.child || !clean) return

    this.child.stdin.write(`${clean}\n`)
  }

  cancel(reason: 'cancelled' | 'timeout' = 'cancelled'): void {
    if (!this.child) return

    this.ending = reason
    void this.group?.stop()
  }

  /**
   * Адрес входа и код из вывода CLI; новое - окну. Только законченные строки: длинный адрес
   * приходит кусками, и обрезанный открылся бы в браузере.
   */
  private parse(login: AcpLogin): void {
    const done = this.output.slice(0, this.output.lastIndexOf('\n') + 1)
    const url = login.urlPattern.exec(done)?.[0] ?? ''
    const { needsCode } = login

    if (!url) return

    const match = needsCode ? null : CODE_PATTERN.exec(done)
    const userCode = match?.[1] ?? match?.[2] ?? ''
    // Kimi открывает страницу входа сам («Opening browser for Kimi device login»).
    const opened = /opening browser/i.test(done)
    const next: AcpSignInStep = { url, userCode, needsCode, opened }

    if (JSON.stringify(next) === JSON.stringify(this.step)) return

    this.step = next
    this.onStep(next)
  }
}

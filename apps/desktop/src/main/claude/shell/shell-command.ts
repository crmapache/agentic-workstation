import { spawn } from 'node:child_process'

import type { ShellStatus } from '@shared/claude-feed'

import { SPAWN_DETACHED } from '../../platform'
import { ProcessGroup } from '../cli/process-group'
import type { Environment } from '../cli/shell-env'
import { commandShell } from './shell-launch'
import { SHELL_TIMEOUT_MS, SHELL_OUTPUT_MAX_CHARS } from './shell.constants'

/** Что вышло у команды: статус, вывод (конец, если длинный) и код выхода. */
export type ShellOutcome = {
  status: ShellStatus
  stdout: string
  stderr: string
  exitCode: number | null
  truncated: boolean
}

/** Вывод по ходу: то же, что итог, пока команда идёт. */
export type ShellOutput = Omit<ShellOutcome, 'status' | 'exitCode'>

/**
 * Одна команда «!»: оболочка человека (`$SHELL -c`, на Windows - PowerShell) в папке проекта,
 * с окружением login shell - те же PATH и переменные, что в его терминале. Своя группа процессов:
 * остановка гасит и всё, что команда запустила. Ввода нет - stdin закрыт.
 */
export class ShellCommand {
  readonly finished: Promise<ShellOutcome>
  private stdout = ''
  private stderr = ''
  private truncated = false
  private stopped = false
  private readonly group: ProcessGroup

  constructor(
    command: string,
    cwd: string,
    env: Environment,
    onOutput: (output: ShellOutput) => void,
  ) {
    const shell = commandShell(command, env)
    const child = spawn(shell.file, shell.args, {
      cwd,
      env,
      detached: SPAWN_DETACHED,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => this.stop(), SHELL_TIMEOUT_MS)
    // Кусок трубы может кончиться посреди буквы: строками поток делает сам Node.
    const append = (stream: 'stdout' | 'stderr') => (chunk: string) => {
      const text = this[stream] + chunk

      this.truncated ||= text.length > SHELL_OUTPUT_MAX_CHARS
      this[stream] = text.slice(-SHELL_OUTPUT_MAX_CHARS)
      onOutput(this.output())
    }

    this.group = new ProcessGroup(child)
    child.stdout.setEncoding('utf8').on('data', append('stdout'))
    child.stderr.setEncoding('utf8').on('data', append('stderr'))
    this.finished = new Promise((resolve) => {
      child.once('error', (error) => {
        clearTimeout(timer)
        resolve({ ...this.output(), stderr: error.message, status: 'failed', exitCode: null })
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        resolve({
          ...this.output(),
          status: this.stopped ? 'stopped' : 'done',
          exitCode: this.stopped ? null : code,
        })
      })
    })
  }

  /** Остановить: сначала мягко, через паузу - насильно, всю группу. */
  stop(): void {
    if (this.stopped || this.group.hasExited) return

    this.stopped = true
    void this.group.stop()
  }

  private output(): ShellOutput {
    return { stdout: this.stdout, stderr: this.stderr, truncated: this.truncated }
  }
}

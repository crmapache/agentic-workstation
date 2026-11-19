import { randomUUID } from 'node:crypto'

import type { ShellFeedItem } from '@shared/conversation-feed'

import { loginShellEnv } from '../../process/shell-env'
import { ShellCommand } from './shell-command'
import type { ShellRun } from './shell-text'
import { shellText } from './shell-text'

/** Что командам «!» нужно от ленты разговора: строка команды и рассылка заплаток. */
export type ShellFeed = {
  builder: { putShell: (item: ShellFeedItem) => void }
  schedule: () => void
  flush: () => void
}

/**
 * Команды «!» разговора: идущие (их можно остановить) и отработавшие, которых модель
 * ещё не видела. Те уходят ей перед следующим сообщением человека и забываются.
 */
export class ShellRuns {
  private readonly running = new Map<string, ShellCommand>()
  /** Отработавшие, которых модель не видела: карточка ленты и что ей отдать. */
  private unseen: { id: string; run: ShellRun }[] = []

  constructor(private readonly feed: ShellFeed) {}

  /** Запустить команду в папке проекта; карточка в ленте живёт по ходу вывода. */
  async run(command: string, cwd: string): Promise<void> {
    const item: ShellFeedItem = {
      kind: 'shell',
      id: randomUUID(),
      parentToolUseId: null,
      command,
      status: 'running',
      stdout: '',
      stderr: '',
      exitCode: null,
      truncated: false,
    }

    this.feed.builder.putShell(item)
    this.feed.schedule()

    const shell = new ShellCommand(command, cwd, await loginShellEnv(), (output) => {
      this.feed.builder.putShell({ ...item, ...output })
      this.feed.schedule()
    })

    this.running.set(item.id, shell)

    const outcome = await shell.finished

    this.running.delete(item.id)
    this.feed.builder.putShell({ ...item, ...outcome })
    this.feed.flush()

    if (outcome.status !== 'failed') {
      this.unseen.push({ id: item.id, run: { command, ...outcome } })
    }
  }

  stop(id: string): void {
    this.running.get(id)?.stop()
  }

  stopAll(): void {
    for (const shell of this.running.values()) shell.stop()
  }

  /** Карточки команд, которых модель ещё не видела: идущих и неотданных. Откат их не трогает. */
  pendingIds(): ReadonlySet<string> {
    return new Set([...this.running.keys(), ...this.unseen.map((entry) => entry.id)])
  }

  /** Команды, которых модель не видела, - текстом перед сообщением; отданное забывается. */
  takeContext(): string {
    const text = shellText(this.unseen.map((entry) => entry.run))

    this.unseen = []

    return text
  }
}

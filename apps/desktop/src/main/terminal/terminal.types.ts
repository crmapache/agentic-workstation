import type { IPty } from 'node-pty'

import type { TerminalSession } from '@shared/terminal'

import type { OutputLog } from './output-log'

/** Что сервису нужно от псевдотерминала: в тестах его подменяет поддельный. */
export type PtyProcess = Pick<
  IPty,
  'onData' | 'onExit' | 'write' | 'resize' | 'kill' | 'pause' | 'resume'
>

export type PtyOptions = { cwd: string; cols: number; rows: number; env: Record<string, string> }

export type SpawnPty = (shell: string, args: string[], options: PtyOptions) => Promise<PtyProcess>

/** Чем и в каком окружении запускать оболочки. */
export type TerminalSetup = {
  spawn: SpawnPty
  shell: () => string
  /** Окружение под эту оболочку: у zsh - ещё и обёртка с цветным приглашением. */
  env: (shell: string) => Promise<Record<string, string>>
}

/** Живая сессия: оболочка, хвост её вывода и ещё не отправленный окну кусок. */
export type LiveSession = {
  session: TerminalSession
  pty: PtyProcess
  log: OutputLog
  /** Вывод, который ждёт отправки окну (уходит раз в FLUSH_MS). */
  pending: string
  flushTimer: NodeJS.Timeout | null
  /** Сколько знаков ушло окну, но ещё не дорисовано им. */
  unacked: number
  paused: boolean
  /** Сбывается, когда оболочка вышла. */
  exited: Promise<void>
}

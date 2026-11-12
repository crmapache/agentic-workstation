import { execFile, execFileSync } from 'node:child_process'

/**
 * Погасить процесс со всем, что он запустил (Windows, ADR 0048). Групп процессов, как на маке
 * (`kill(-pid)`), там нет: дерево гасит taskkill /T. Насильно (/F): мягкого сигнала консольному
 * процессу без окна Windows не даёт - taskkill без /F такого просто не гасит.
 */
export const killProcessTree = (pid: number): Promise<void> =>
  new Promise((resolve) => {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => resolve())
  })

/** То же синхронно: главный процесс уже уходит, ждать некому (ProcessGroup.killAllNow). */
export const killProcessTreeNow = (pid: number): void => {
  try {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch {
    // Дерево уже пусто - гасить нечего.
  }
}

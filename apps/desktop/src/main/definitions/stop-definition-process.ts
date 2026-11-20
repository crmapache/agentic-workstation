import type { UtilityProcess } from 'electron'

/** Память освобождена только после exit; не пришёл за timeoutMs - ошибка, процесс всё ещё наш. */
export const awaitDefinitionExit = (child: UtilityProcess, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const exited = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', exited)
      reject(new Error('definitions stop timed out'))
    }, timeoutMs)

    child.once('exit', exited)
  })

/**
 * Успех kill означает отправку сигнала, а не выход. До spawn у процесса ещё нет pid: ждём его и
 * останавливаем тот же объект, не ищем процессы по имени. Мягкий сигнал не ушёл или не помог за
 * graceMs - SIGKILL тому же pid, как у групп процессов IDE. Ошибка - только если exit не пришёл
 * и после него.
 */
export const stopDefinitionProcess = (
  child: UtilityProcess,
  graceMs: number,
  timeoutMs: number,
): Promise<void> => {
  let grace: NodeJS.Timeout | undefined
  // exit ещё не пришёл, значит pid всё ещё наш процесс.
  const hard = () => {
    if (child.pid === undefined) return

    try {
      process.kill(child.pid, 'SIGKILL')
    } catch (error) {
      // Процесс уже уходит сам: exit придёт без нас.
      console.warn('[definitions] SIGKILL failed', error)
    }
  }
  const soft = () => {
    let sent = false

    try {
      sent = child.kill()
    } catch (error) {
      console.warn('[definitions] kill failed', error)
    }
    if (sent) grace = setTimeout(hard, graceMs)
    else hard()
  }
  const exit = awaitDefinitionExit(child, timeoutMs).finally(() => {
    clearTimeout(grace)
    child.removeListener('spawn', soft)
  })

  if (child.pid === undefined) child.once('spawn', soft)
  else soft()

  return exit
}

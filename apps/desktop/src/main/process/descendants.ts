import { execFileSync } from 'node:child_process'

/** Сколько ждать список процессов: он нужен на выходе, где ждать некогда. */
const PS_TIMEOUT_MS = 2_000

/** Все процессы: номер, родитель, группа; не вышло - пусто. */
const listProcesses = (): string => {
  try {
    return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], {
      encoding: 'utf8',
      timeout: PS_TIMEOUT_MS,
    })
  } catch {
    return ''
  }
}

/**
 * Группы процессов потомков pid, кроме его собственной (macOS, Linux): CLI, который запускает
 * команды каждую в своей группе (OpenCode - `detached`), оставил бы их жить после себя -
 * сигнал своей группе до них не доходит. Список - сразу, синхронно: на выходе IDE ждать
 * некогда, а после выхода корня его дети уже не его (их забирает launchd).
 */
export const descendantGroups = (rootPid: number): number[] => {
  const listing = listProcesses()

  if (!listing) return []

  const children = new Map<number, { pid: number; pgid: number }[]>()

  for (const line of listing.split('\n')) {
    const [pid, ppid, pgid] = line.trim().split(/\s+/).map(Number)

    if (!pid || ppid === undefined || !pgid) continue

    children.set(ppid, [...(children.get(ppid) ?? []), { pid, pgid }])
  }

  const groups = new Set<number>()
  const queue = [rootPid]

  for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
    for (const child of children.get(pid) ?? []) {
      if (child.pgid !== rootPid) groups.add(child.pgid)
      queue.push(child.pid)
    }
  }

  return [...groups]
}

/** Сигнал группам; уже пустая группа - тихо. */
export const signalGroups = (groups: Iterable<number>, signal: NodeJS.Signals): void => {
  for (const group of groups) {
    try {
      process.kill(-group, signal)
    } catch {
      // Группа уже пуста - гасить нечего.
    }
  }
}

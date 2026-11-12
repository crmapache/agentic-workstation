import { createHash } from 'node:crypto'
import { rm, open, stat, mkdir, rename, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/** Что лежит в файле: нет его, не читается (это не «пусто») или текст. */
export type Stored = { kind: 'missing' } | { kind: 'unreadable' } | { kind: 'text'; text: string }

/** Сколько ждать чужой замок, прежде чем работать без него. */
const LOCK_WAIT_MS = 2_000
const LOCK_STEP_MS = 20

/** Замок старше этого - брошенный: процесс, взявший его, умер, не сняв. */
const LOCK_STALE_MS = 30_000

/** Цепочки работы по файлу внутри процесса: замок на диске - для другой IDE. */
const chains = new Map<string, Promise<unknown>>()

/** Короткое имя проекта на диске: хеш пути, а не путь - папка не растёт от вложенности. */
export const projectKey = (projectPath: string): string =>
  createHash('sha256').update(projectPath, 'utf8').digest('hex').slice(0, 16)

/**
 * Файл сценариев с тремя гарантиями (как ScenarioFile в ACC): «нет» и «не читается» -
 * разные ответы (прочитанный как пустой, он был бы перезаписан и ночь работы пропала бы);
 * запись - рядом и переносом, недописанного файла не бывает; работа над ним - под замком,
 * и второй процесс IDE (dev рядом с установленной) не возьмёт тот же час или ход очереди.
 */
export class LockedFile {
  constructor(readonly path: string) {}

  async read(): Promise<Stored> {
    try {
      const text = await readFile(this.path, 'utf8')

      return text.trim() ? { kind: 'text', text } : { kind: 'unreadable' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }

      console.warn('[scenarios] файл не прочитался:', this.path, error)

      return { kind: 'unreadable' }
    }
  }

  /** Записать целиком; false - не легло на диск (захват, соврав, поднял бы прогон дважды). */
  async put(text: string): Promise<boolean> {
    const beside = `${this.path}.part`

    try {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(beside, text, 'utf8')
      await rename(beside, this.path)

      return true
    } catch (error) {
      console.warn('[scenarios] файл не записался:', this.path, error)

      return false
    }
  }

  /**
   * Работа под замком: своя очередь в процессе и файл `.lock` рядом для другого процесса.
   * Отдельный файл, а не сам список: запись списка не должна снимать замок. Не вышло взять
   * замок (сетевая шара, чужой не отпускает) - работа делается без него, как было бы без замков.
   */
  underLock<T>(work: () => Promise<T>): Promise<T> {
    const previous = chains.get(this.path) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(() => this.withLockFile(work))

    chains.set(this.path, next)
    void next.finally(() => {
      if (chains.get(this.path) === next) chains.delete(this.path)
    })

    return next
  }

  private async withLockFile<T>(work: () => Promise<T>): Promise<T> {
    const lock = `${this.path}.lock`
    const held = await this.take(lock)

    try {
      return await work()
    } finally {
      if (held) await rm(lock, { force: true }).catch(() => undefined)
    }
  }

  private async take(lock: string): Promise<boolean> {
    const until = Date.now() + LOCK_WAIT_MS

    try {
      await mkdir(dirname(lock), { recursive: true })
    } catch {
      return false
    }

    while (Date.now() < until) {
      try {
        const handle = await open(lock, 'wx')

        await handle.writeFile(String(process.pid))
        await handle.close()

        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false

        const info = await stat(lock).catch(() => null)

        if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await rm(lock, { force: true }).catch(() => undefined)
        } else {
          await delay(LOCK_STEP_MS)
        }
      }
    }

    return false
  }
}

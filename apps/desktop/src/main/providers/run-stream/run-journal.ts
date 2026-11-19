import { mkdir, rename, readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Кто сказал строку журнала: движок, модель, вызов инструмента, сбой. */
export type JournalSpeaker = 'prompt' | 'model' | 'tool' | 'error'

/** Первая строка журнала: чей это разговор у провайдера и где он идёт. */
type JournalHead = { native: string; cwd: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Файл журнала сессии движка в папке провайдера. */
export const journalPath = (dir: string, engineId: string): string => join(dir, `${engineId}.jsonl`)

/**
 * Журнал сессии прогона у провайдера без транскриптов Claude (Codex, OpenCode;
 * docs/plan-providers/50-ide.md). Движок сценариев знает разговор по своему UUID и смотрит,
 * есть ли `<папка>/<id>.jsonl` (продолжать или начинать заново, можно ли голове перехватить
 * карточку), а голове при перехвате даёт путь к этому файлу - она читает его своими
 * инструментами. Первая строка - id разговора у провайдера (поток Codex, сессия OpenCode):
 * по ней сессия продолжается после перезапуска. Дальше - что было сказано и сделано, по
 * строке на событие.
 */
export class RunJournal {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    readonly path: string,
    private head: JournalHead | null,
  ) {}

  /** Журнал сессии: прошлый (с его разговором у провайдера) или новый, ещё не записанный. */
  static async open(dir: string, engineId: string): Promise<RunJournal> {
    const path = journalPath(dir, engineId)
    const first = await readFile(path, 'utf8')
      .then((text) => text.split('\n', 1)[0] ?? '')
      .catch(() => '')
    let head: JournalHead | null = null

    try {
      const parsed: unknown = first ? JSON.parse(first) : null

      if (isRecord(parsed) && typeof parsed['native'] === 'string' && parsed['native']) {
        head = {
          native: parsed['native'],
          cwd: typeof parsed['cwd'] === 'string' ? parsed['cwd'] : '',
        }
      }
    } catch {
      head = null
    }

    return new RunJournal(path, head)
  }

  /** id разговора у провайдера; null - журнала ещё нет (сессия новая). */
  get native(): string | null {
    return this.head?.native ?? null
  }

  /**
   * Разговор у провайдера начат: журнал заводится его id. Другой разговор вместо прежнего
   * (прежний у провайдера пропал) - шапка переписывается целиком: по первой строке сессию
   * продолжают, прячут из истории и открывают чатом.
   */
  begin(native: string, cwd: string): Promise<void> {
    if (this.head?.native === native) return this.writing

    const replaced = this.head !== null

    this.head = { native, cwd }

    return this.append(async () => {
      const head = `${JSON.stringify({ native, cwd })}\n`

      await mkdir(join(this.path, '..'), { recursive: true })

      if (!replaced) return appendFile(this.path, head)

      const lines = (await readFile(this.path, 'utf8').catch(() => '')).split('\n').slice(1)
      const temp = `${this.path}.tmp`

      await writeFile(temp, head + lines.join('\n'))
      await rename(temp, this.path)
    })
  }

  /** Строка разговора; пустое не пишется. Журнал без начала (сбой до разговора) - молчит. */
  note(who: JournalSpeaker, text: string): void {
    const said = text.trim()

    if (!said || !this.head) return

    void this.append(() =>
      appendFile(
        this.path,
        `${JSON.stringify({ at: new Date().toISOString(), who, text: said })}\n`,
      ),
    )
  }

  /** Записи - по очереди: строки журнала не перемешиваются. */
  private append(write: () => Promise<void>): Promise<void> {
    this.writing = this.writing
      .then(write)
      .catch((error: unknown) => console.warn('[runs] журнал сессии не записался:', error))

    return this.writing
  }
}

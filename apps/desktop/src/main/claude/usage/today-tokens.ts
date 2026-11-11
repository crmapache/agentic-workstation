import { AnswerSet, lineTokens, readLinesFrom, transcriptFiles } from './transcript-answers'

/** Полночь дня момента по часам этой машины: «сегодня» счётчика - день человека. */
const startOfDay = (at: number): number => new Date(at).setHours(0, 0, 0, 0)

/**
 * Сколько токенов ушло сегодня по всем проектам машины - счётчик «tok» у поля ввода, как в
 * ACC. Из транскриптов CLI вместе с субагентами, а не из ходов панели: ход отчитывается только
 * за основной разговор, и мимо вкладок идут целые прогоны. Читаются только файлы,
 * тронутые сегодня, и только дописанное с прошлого раза; в памяти - ответы идущего дня.
 * Ничего не хранит на диске: перезапуск IDE просто перечитает сегодняшние файлы.
 */
export class TodayTokens {
  /** До какого байта прочитан каждый файл. */
  private readonly offsets = new Map<string, number>()
  private readonly answers = new AnswerSet()
  private reading: Promise<void> | null = null

  constructor(
    private readonly projectsDir: () => Promise<string>,
    private readonly now: () => number = Date.now,
  ) {}

  async count(): Promise<number> {
    await this.refresh()

    return this.answers.total()
  }

  /** Одно чтение за раз: второй вопрос ждёт первое, а не читает те же байты рядом. */
  private refresh(): Promise<void> {
    this.reading ??= this.read().finally(() => {
      this.reading = null
    })

    return this.reading
  }

  private async read() {
    const root = await this.projectsDir()
    const today = startOfDay(this.now())

    // Файл, не тронутый с полуночи, сегодняшних ответов не несёт.
    for (const file of await transcriptFiles(root, today)) {
      const known = this.offsets.get(file.path) ?? 0
      // Файл стал короче (переписан) - читается заново.
      const offset = file.size < known ? 0 : known

      if (file.size === offset) continue

      const end = await readLinesFrom(file.path, offset, (line) => {
        const answer = lineTokens(line)

        if (answer) this.answers.add(answer.key, answer.at, answer.tokens)
      })

      this.offsets.set(file.path, end)
    }

    // Ответ, начатый до полуночи, - вчерашний: время ответа - его самая ранняя строка.
    this.answers.forgetBefore(today)
  }
}

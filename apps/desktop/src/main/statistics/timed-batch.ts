import type { DatabaseSync } from 'node:sqlite'
import { setImmediate as nextTurn } from 'node:timers/promises'

/** Сколько работы держать в одной транзакции перед фиксацией и паузой. */
const BATCH_MS = 250

/**
 * Длинная работа с базой кусками: одна транзакция на ~BATCH_MS работы, потом фиксация и
 * пауза в цикле событий потока. Мелкие транзакции на каждый кусок файла упирались в
 * фиксацию: первый проход по 7.6 ГБ тратил на COMMIT больше, чем на разбор. А пауза
 * пропускает запросы окна, пришедшие во время прохода, - они ждут не дольше одного куска.
 *
 * Внутри транзакции между кусками нет await: запрос, пришедший в поток, не попадёт в чужую
 * незафиксированную транзакцию.
 */
export class TimedBatch {
  private open = false
  private since = 0

  constructor(private readonly db: DatabaseSync) {}

  /** Сделать шаг в транзакции; ошибка шага откатывает только его (точка сохранения). */
  step<T>(run: () => T): T {
    if (!this.open) {
      this.db.exec('BEGIN')
      this.open = true
      this.since = performance.now()
    }

    this.db.exec('SAVEPOINT step')

    try {
      const result = run()

      this.db.exec('RELEASE step')

      return result
    } catch (error) {
      this.db.exec('ROLLBACK TO step')
      this.db.exec('RELEASE step')
      throw error
    }
  }

  /** Время вышло - зафиксировать и отдать поток другим сообщениям. */
  async breathe(): Promise<void> {
    if (!this.open || performance.now() - this.since < BATCH_MS) return

    this.commit()
    await nextTurn()
  }

  /** Зафиксировать; не вышло (диск полон) - откатить, чтобы следующий BEGIN не упал. */
  commit(): void {
    if (!this.open) return

    this.open = false

    try {
      this.db.exec('COMMIT')
    } catch (error) {
      this.rollback()
      throw error
    }
  }

  /** Бросить незафиксированное: проход оборвался ошибкой, а не кончился. */
  rollback(): void {
    this.open = false

    if (this.db.isTransaction) this.db.exec('ROLLBACK')
  }
}

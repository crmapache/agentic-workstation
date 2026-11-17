/** Сколько строк добавлено и удалено по всем файлам разницы. */
export type NumstatSum = { added: number; deleted: number }

const COUNT = /^\d+$/

/**
 * Сумма строк из `git diff --numstat -z`. Запись - `добавлено\tудалено\tпуть`; у
 * переименования путь пустой, а прежний и новый приходят следующими двумя записями - их
 * пропускаем, хоть бы имя и походило на числа. Двоичный файл - «-» вместо чисел: строк у
 * него нет. Путь режется по второй табуляции, а не по каждой: табуляция бывает и в имени.
 */
export class NumstatParser {
  private added = 0
  private deleted = 0
  /** Сколько следующих записей - пути переименования, а не числа. */
  private movePaths = 0

  push(record: string): void {
    if (this.movePaths > 0) {
      this.movePaths -= 1

      return
    }

    const first = record.indexOf('\t')
    const second = first === -1 ? -1 : record.indexOf('\t', first + 1)

    if (second === -1) return

    const added = record.slice(0, first)
    const deleted = record.slice(first + 1, second)

    if (second === record.length - 1) this.movePaths = 2
    if (COUNT.test(added)) this.added += Number(added)
    if (COUNT.test(deleted)) this.deleted += Number(deleted)
  }

  result(): NumstatSum {
    return { added: this.added, deleted: this.deleted }
  }
}

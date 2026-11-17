import { it, expect, describe } from 'vitest'

import { NumstatParser } from './git-numstat-output'

/** Записи `git diff --numstat -z` по одной, как их режет RecordReader. */
const sum = (...records: string[]) => {
  const parser = new NumstatParser()

  for (const record of records) parser.push(record)

  return parser.result()
}

describe('NumstatParser', () => {
  it('складывает строки всех файлов', () => {
    expect(sum('3\t1\tsrc/app.ts', '10\t0\tsrc/new.ts', '0\t7\tsrc/gone.ts')).toEqual({
      added: 13,
      deleted: 8,
    })
  })

  it('двоичный файл строк не даёт', () => {
    expect(sum('-\t-\tlogo.png', '2\t2\tREADME.md')).toEqual({ added: 2, deleted: 2 })
  })

  it('у переименования два пути после записи - не числа, даже если похожи на них', () => {
    expect(sum('4\t1\t', '1\t2\told', '5\t6\tnew', '1\t0\tother.ts')).toEqual({
      added: 5,
      deleted: 1,
    })
  })

  it('табуляция в имени файла не сбивает разбор', () => {
    expect(sum('2\t1\t\tstarts-with-tab.ts', '1\t1\tname\twith\ttabs')).toEqual({
      added: 3,
      deleted: 2,
    })
  })

  it('пустой вывод - ноль строк', () => {
    expect(sum()).toEqual({ added: 0, deleted: 0 })
  })
})

import { it, expect, describe } from 'vitest'

import { hunkCounts, hunksFromDiff } from './codex-diff'

describe('дифф правки Codex', () => {
  it('куски по @@, строки контекста, добавления и удаления', () => {
    const hunks = hunksFromDiff(
      '--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n a\n-b\n+B\n+c\n@@ -10 +11 @@\n-z\n+Z\n',
      'update',
    )

    expect(hunks).toEqual([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' a', '-b', '+B', '+c'] },
      { oldStart: 10, oldLines: 1, newStart: 11, newLines: 1, lines: ['-z', '+Z'] },
    ])
    expect(hunkCounts(hunks)).toEqual({ added: 3, removed: 2 })
  })

  it('новый файл без кусков - всё добавлено с первой строки; пустой дифф - ничего', () => {
    expect(hunksFromDiff('one\ntwo\n', 'add')).toEqual([
      { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+one', '+two'] },
    ])
    expect(hunksFromDiff('', 'add')).toEqual([])
    expect(hunksFromDiff('no hunks here', 'update')).toEqual([])
  })
})

import type { FileEdit } from './change-revert'
import { redoEdits } from './change-revert'
import type { TurnFile } from './changes.types'
import { patchLines } from './line-counts'
import { lineDiff } from './line-diff'

/** Настоящий итог хода по файлу: от того, с чего ход начал, до того, что стоит на диске. */
export type SettledFile = { added: number; removed: number; edits: FileEdit[] }

/**
 * Сверка файла хода с диском в конце хода. Файл меняли не только правки с диффом:
 * форматтер после каждой правки (хук PostToolUse), `sed` и скрипты агента, сам CLI,
 * дописавший файл памяти. Тогда дифф хода не ведёт к тому, что лежит на диске, и откат по
 * нему мог бы только отказать. Ожидаемое - правки хода поверх того, с чего ход начал файл:
 * пустоты у созданного, копии CLI (copy) у правленного. Совпало - null, так почти всегда.
 *
 * Копия обязана быть файлом, который застал этот ход: первая его правка к ней
 * прикладывается. Копия от раньше унесла бы в откат чужое, а откат, стирающий чужое, хуже
 * отказа. У файла с большой правкой без диффа (owing) диффы хода не говорят ничего
 * наверняка - итог считается по одной копии.
 */
export const settleFile = (
  file: TurnFile,
  copy: string | null,
  left: string | null,
): SettledFile | null => {
  const created = file.edits[0]?.kind === 'create'
  const before = created ? '' : copy

  if (left === null || before === null) return null
  if (!created && !file.owing && redoEdits(before, file.edits.slice(0, 1)).kind !== 'text') {
    return null
  }

  if (!file.owing) {
    const expected = redoEdits(created ? null : before, file.edits)

    if (expected.kind === 'text' && expected.text === left) return null
  }

  const hunks = lineDiff(before, left)

  if (!hunks?.length) return null

  // Созданный едет как «создан пустым и заполнен»: текст тогда - ханками, как у правки.
  const patch: FileEdit = { kind: 'patch', hunks }

  return {
    ...patchLines(hunks),
    edits: created ? [{ kind: 'create', content: '' }, patch] : [patch],
  }
}

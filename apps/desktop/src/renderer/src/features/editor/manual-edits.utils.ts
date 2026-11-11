import type { editor } from 'monaco-editor'

import type { ManualDelta } from '../../lib/activity-log'

/** Знаки и строки одного события правки: строки - по переводам строк и захваченным строкам. */
export const editDelta = (
  changes: readonly Pick<editor.IModelContentChange, 'text' | 'range'>[],
  pasted: boolean,
): ManualDelta =>
  changes.reduce<ManualDelta>(
    (sum, change) => {
      const chars = change.text.length

      return {
        typed: sum.typed + (pasted ? 0 : chars),
        pasted: sum.pasted + (pasted ? chars : 0),
        added: sum.added + (change.text.match(/\n/g)?.length ?? 0),
        removed: sum.removed + (change.range.endLineNumber - change.range.startLineNumber),
      }
    },
    { typed: 0, pasted: 0, added: 0, removed: 0 },
  )

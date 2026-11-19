import { it, expect, describe } from 'vitest'

import { hunksOfUnifiedDiff } from '../feed/unified-diff'
import { reverseHunks } from './reverse-patch'

const DIFF = `@@ -1,2 +1,3 @@
 export const add = (a: number, b: number) => a + b
+export const subtract = (a: number, b: number) => a - b
 export const one = 1`

describe('правка агента в обратную сторону', () => {
  it('новые строки - обратно в старые, и по месту, и если файл сдвинулся выше', () => {
    const hunks = hunksOfUnifiedDiff(DIFF)
    const after =
      'export const add = (a: number, b: number) => a + b\nexport const subtract = (a: number, b: number) => a - b\nexport const one = 1\n'

    expect(reverseHunks(after, hunks)).toBe(
      'export const add = (a: number, b: number) => a + b\nexport const one = 1\n',
    )
    expect(reverseHunks(`// header\n${after}`, hunks)).toBe(
      '// header\nexport const add = (a: number, b: number) => a + b\nexport const one = 1\n',
    )
  })

  it('кусок после правки переписали - null: вернуть, не затерев чужое, нельзя', () => {
    const hunks = hunksOfUnifiedDiff(DIFF)

    expect(reverseHunks('export const add = 1\nexport const one = 1\n', hunks)).toBeNull()
  })
})

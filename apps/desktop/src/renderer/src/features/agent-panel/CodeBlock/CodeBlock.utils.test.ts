import { it, expect, describe } from 'vitest'
import type { ThemedToken } from 'shiki/core'

import type { CodePath } from './CodeBlock.types'
import { plainRuns, findCodePaths, highlightedRuns } from './CodeBlock.utils'

const STYLES = { tokenString: 'string', tokenKeyword: 'keyword', foreground: 'fg' }

/** Токен shiki: роль цвета переменной темы и смещение в коде. */
const token = (content: string, offset: number, role: string): ThemedToken => ({
  content,
  offset,
  color: `var(--shiki-${role})`,
})

const path = (start: number, end: number, file: string): CodePath => ({
  start,
  end,
  request: { path: file },
  folder: false,
})

describe('findCodePaths', () => {
  it('finds paths with their offsets and leaves web addresses alone', () => {
    const code = 'open src/app.ts\ncurl https://example.com/a.ts'
    const paths = findCodePaths(code, { hasFile: () => false, hasFolder: () => false })

    expect(paths.map((found) => code.slice(found.start, found.end))).toEqual(['src/app.ts'])
    expect(paths[0]?.request.path).toBe('src/app.ts')
  })
})

describe('plainRuns', () => {
  it('cuts the code around the paths', () => {
    const runs = plainRuns('see a/b.ts here', [path(4, 10, 'a/b.ts')])

    expect(runs).toEqual([
      { path: null, segments: [{ text: 'see ', className: '' }] },
      { path: path(4, 10, 'a/b.ts'), segments: [{ text: 'a/b.ts', className: '' }] },
      { path: null, segments: [{ text: ' here', className: '' }] },
    ])
  })
})

describe('highlightedRuns', () => {
  // Путь, который подсветка разрезала на несколько токенов, - одна ссылка, а куски
  // внутри неё сохраняют свои цвета.
  it('keeps a path split by highlighting one link with coloured pieces', () => {
    const code = "import x from './a/b.ts'"
    const start = code.indexOf('./a')
    const lines = [
      [
        token('import', 0, 'token-keyword'),
        token(' x from ', 6, 'foreground'),
        token("'./a/", 14, 'token-string'),
        token("b.ts'", 19, 'token-string'),
      ],
    ]
    const runs = highlightedRuns(lines, [path(start, start + 8, './a/b.ts')], STYLES)

    expect(
      runs[0]?.map((run) => [run.path?.request.path ?? null, run.segments.map((s) => s.text)]),
    ).toEqual([
      [null, ['import', ' x from ', "'"]],
      ['./a/b.ts', ['./a/', 'b.ts']],
      [null, ["'"]],
    ])
    expect(runs[0]?.[1]?.segments.map((segment) => segment.className)).toEqual(['string', 'string'])
  })

  it('walks paths across lines by their offsets', () => {
    const lines = [[token('a.ts', 0, 'foreground')], [token('b/c.ts', 5, 'foreground')]]
    const runs = highlightedRuns(lines, [path(0, 4, 'a.ts'), path(5, 11, 'b/c.ts')], STYLES)

    expect(runs.map((line) => line.map((run) => run.path?.request.path))).toEqual([
      ['a.ts'],
      ['b/c.ts'],
    ])
  })
})

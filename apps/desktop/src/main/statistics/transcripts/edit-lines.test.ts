import { it, expect, describe } from 'vitest'

import {
  editLines,
  patchLines,
  extensionOf,
  writtenLines,
  isNotAuthoredCommand,
} from './edit-lines'

describe('editLines', () => {
  it('does not count shared head and tail lines', () => {
    expect(editLines('a\nb\nc\nd', 'a\nX\nY\nd')).toEqual({ added: 2, removed: 2 })
    expect(editLines('same', 'same')).toEqual({ added: 0, removed: 0 })
    expect(editLines('', 'one\ntwo')).toEqual({ added: 2, removed: 1 })
  })
})

describe('writtenLines', () => {
  it('counts lines without a trailing empty one', () => {
    expect(writtenLines('a\nb\n')).toBe(2)
    expect(writtenLines('a\nb')).toBe(2)
    expect(writtenLines('\n\n')).toBe(0)
  })
})

describe('patchLines', () => {
  it('counts plus and minus lines of every hunk', () => {
    const hunks = [{ lines: ['+a', '-b', ' c'] }, { lines: ['+d', '\\ No newline at end of file'] }]

    expect(patchLines(hunks)).toEqual({ added: 2, removed: 1 })
    expect(patchLines(null)).toEqual({ added: 0, removed: 0 })
  })
})

describe('isNotAuthoredCommand', () => {
  it('skips version control, formatters and package managers', () => {
    expect(isNotAuthoredCommand('cd /x && git pull --rebase')).toBe(true)
    expect(isNotAuthoredCommand('git -C /repo checkout -b feat')).toBe(true)
    expect(isNotAuthoredCommand('npx prettier --write src')).toBe(true)
    expect(isNotAuthoredCommand('pnpm install')).toBe(true)
  })

  it('keeps commands that write code', () => {
    expect(isNotAuthoredCommand("cat > a.ts <<'EOF'\nexport {}\nEOF")).toBe(false)
    expect(isNotAuthoredCommand("sed -i '' 's/a/b/' x.ts")).toBe(false)
    expect(isNotAuthoredCommand('git apply fix.patch')).toBe(false)
  })
})

describe('extensionOf', () => {
  it('takes the last extension of the file name', () => {
    expect(extensionOf('/a/b.test.TS')).toBe('ts')
    expect(extensionOf('/a/Makefile')).toBe('')
    expect(extensionOf('/a/.env')).toBe('')
    expect(extensionOf('/a.dir/file')).toBe('')
  })
})

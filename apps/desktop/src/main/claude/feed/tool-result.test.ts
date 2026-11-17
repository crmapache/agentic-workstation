import { it, expect, describe } from 'vitest'

import { MAX_PATCH_LINES } from './feed.constants'
import { buildToolResult } from './tool-result'

const block = (content: string) => ({ type: 'tool_result', tool_use_id: 't1', content })

/** Половина `tool_use_result` у Write и Edit - в форме CLI 2.1.293 (из настоящих транскриптов). */
const write = (fields: Record<string, unknown>) => ({
  filePath: '/Users/dev/project/notes.txt',
  userModified: false,
  ...fields,
})

describe('строки правки в результате вызова', () => {
  // CLI отдаёт новому файлу пустой дифф: раньше лента писала ему «+0 -0».
  it('созданный файл - строки содержимого, без лишней за переводом строки в конце', () => {
    const result = buildToolResult(
      block('File created successfully at: /Users/dev/project/notes.txt'),
      write({ type: 'create', content: 'a\nb\nc\n', structuredPatch: [], originalFile: null }),
    )

    expect(result.changeCounts).toEqual({ added: 3, removed: 0 })
    expect(result.created).toBe(true)
    expect(result.uncounted).toBeUndefined()
    expect(result.patch).toBeUndefined()
  })

  it('перезапись файла - настоящий дифф CLI', () => {
    const result = buildToolResult(
      block('The file /Users/dev/project/notes.txt has been updated successfully.'),
      write({
        type: 'update',
        content: 'Hello\nWorld\n',
        originalFile: 'Hello\n',
        structuredPatch: [
          { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [' Hello', '+World'] },
        ],
      }),
    )

    expect(result.changeCounts).toEqual({ added: 1, removed: 0 })
    expect(result.created).toBeUndefined()
    expect(result.patch?.[0]?.lines).toEqual([' Hello', '+World'])
  })

  it('длинный дифф режется для показа, а строки считаются по всему', () => {
    const lines = [
      ...Array.from({ length: 2000 }, (_, index) => `+new ${index}`),
      ...Array.from({ length: 1000 }, (_, index) => `-old ${index}`),
    ]
    const result = buildToolResult(
      block('ok'),
      write({
        type: 'update',
        content: '',
        originalFile: '',
        structuredPatch: [{ oldStart: 1, oldLines: 1000, newStart: 1, newLines: 2000, lines }],
      }),
    )

    expect(result.patch?.[0]?.lines).toHaveLength(MAX_PATCH_LINES)
    expect(result.changeCounts).toEqual({ added: 2000, removed: 1000 })
  })

  // Большой файл CLI не сравнивает: пустой дифф - «не посчитать», а не ноль строк.
  it('большая правка с пустым диффом - без цифр, с пометкой uncounted', () => {
    const result = buildToolResult(
      block('The file /Users/dev/project/huge.js has been updated. All occurrences were replaced.'),
      {
        filePath: '/Users/dev/project/huge.js',
        oldString: 'foo(',
        newString: 'bar(',
        originalFile: null,
        structuredPatch: [],
        userModified: false,
        replaceAll: true,
        contentNotInModelContext: true,
      },
    )

    expect(result.uncounted).toBe(true)
    expect(result.changeCounts).toBeUndefined()
  })

  it('Write того же текста - настоящий ноль, а не «не посчитать»', () => {
    const result = buildToolResult(
      block('ok'),
      write({ type: 'update', content: 'x\n', originalFile: 'x\n', structuredPatch: [] }),
    )

    expect(result.changeCounts).toEqual({ added: 0, removed: 0 })
    expect(result.uncounted).toBeUndefined()
  })

  it('вызов без диффа (команда) - ни цифр, ни пометки', () => {
    const result = buildToolResult(block('done'), { stdout: 'done', stderr: '' })

    expect(result.changeCounts).toBeUndefined()
    expect(result.uncounted).toBeUndefined()
  })
})

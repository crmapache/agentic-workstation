import { it, expect, describe } from 'vitest'

import { movedExpanded, withoutExpanded } from '../file-tree.utils'
import { ROOT_ITEM } from './FileTreeView.constants'
import { allows, stemLength, directoryOf, renamedPath, treeShortcut } from './FileTreeView.utils'

const key = (
  key: string,
  mods: Partial<Record<'metaKey' | 'altKey' | 'shiftKey' | 'ctrlKey', boolean>> = {},
  code = '',
) => ({
  key,
  code,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  ...mods,
})

describe('дерево файлов: действия', () => {
  it('клавиши - как в WebStorm и Finder', () => {
    expect(treeShortcut(key('c', { metaKey: true }, 'KeyC'))).toBe('copy')
    expect(treeShortcut(key('ç', { metaKey: true, altKey: true }, 'KeyC'))).toBe('copyPath')
    expect(treeShortcut(key('x', { metaKey: true }, 'KeyX'))).toBe('cut')
    expect(treeShortcut(key('v', { metaKey: true }, 'KeyV'))).toBe('paste')
    expect(treeShortcut(key('F6', { shiftKey: true }))).toBe('rename')
    expect(treeShortcut(key('F2'))).toBe('rename')
    expect(treeShortcut(key('Backspace', { metaKey: true }))).toBe('trash')
    expect(treeShortcut(key('Backspace'))).toBeNull()
    expect(treeShortcut(key('c', { ctrlKey: true }, 'KeyC'))).toBeNull()
  })

  it('создать - только в папке; корень проекта не вырезают, не переименовывают и не удаляют', () => {
    const file = { path: 'src/a.ts', isDirectory: false }

    expect(allows('newFile', file)).toBe(false)
    expect(allows('newFile', ROOT_ITEM)).toBe(true)
    expect(allows('rename', ROOT_ITEM)).toBe(false)
    expect(allows('trash', file)).toBe(true)
    expect(allows('paste', ROOT_ITEM)).toBe(true)
  })

  it('вставка у файла - рядом с ним; новое имя - в той же папке; выделено имя без расширения', () => {
    expect(directoryOf({ path: 'src/a.ts', isDirectory: false })).toBe('src')
    expect(directoryOf({ path: 'src', isDirectory: true })).toBe('src')
    expect(renamedPath('src/a.ts', 'b.ts')).toBe('src/b.ts')
    expect(renamedPath('a.ts', 'b.ts')).toBe('b.ts')
    expect(stemLength('Button.module.scss', false)).toBe('Button.module'.length)
    expect(stemLength('.env', false)).toBe(4)
    expect(stemLength('my.folder', true)).toBe(9)
  })

  it('раскрытые папки едут за переносом, убранная - забывается', () => {
    expect(movedExpanded(['src', 'src/ui', 'srcx'], 'src', 'lib/src')).toEqual([
      'lib/src',
      'lib/src/ui',
      'srcx',
      'lib',
    ])
    expect(withoutExpanded(['src', 'src/ui', 'srcx'], 'src')).toEqual(['srcx'])
  })
})

import { it, expect, describe } from 'vitest'

import { ancestorPaths, symlinkedFolders } from './file-tree.utils'

describe('ancestorPaths', () => {
  it('все папки над файлом, от корня вглубь', () => {
    expect(ancestorPaths('src/features/tree/Node.tsx')).toEqual([
      'src',
      'src/features',
      'src/features/tree',
    ])
  })

  it('у файла в корне папок нет', () => {
    expect(ancestorPaths('package.json')).toEqual([])
  })
})

describe('symlinkedFolders', () => {
  it('только папки-ссылки, из всех прочитанных списков', () => {
    const entry = (relativePath: string, kind: 'file' | 'directory', isSymlink: boolean) => ({
      name: relativePath.split('/').at(-1) ?? '',
      relativePath,
      kind,
      isSymlink,
    })

    expect(
      symlinkedFolders([
        [entry('node_modules/ui', 'directory', true), entry('node_modules/a', 'directory', false)],
        undefined,
        [entry('link.txt', 'file', true)],
      ]),
    ).toEqual(['node_modules/ui'])
  })
})

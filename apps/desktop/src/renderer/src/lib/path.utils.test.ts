import { it, expect, describe } from 'vitest'

import {
  baseName,
  joinRoot,
  splitPath,
  relativeTo,
  displayPath,
  isInsideAny,
  movedPathOf,
  isOutsidePath,
} from './path.utils'

describe('splitPath', () => {
  it('папка без слеша на конце и имя файла', () => {
    expect(splitPath('src/app/main.tsx')).toEqual({ folder: 'src/app', name: 'main.tsx' })
  })

  it('файл в корне проекта - без папки', () => {
    expect(splitPath('package.json')).toEqual({ folder: '', name: 'package.json' })
  })
})

describe('baseName', () => {
  it('последняя часть пути, слеш на конце не мешает', () => {
    expect(baseName('/Users/max/Documents/Projects/roas-radar')).toBe('roas-radar')
    expect(baseName('/Users/max/web/')).toBe('web')
    expect(baseName('src/app/main.tsx')).toBe('main.tsx')
  })

  it('путь без частей - как есть', () => {
    expect(baseName('/')).toBe('/')
  })
})

describe('isOutsidePath', () => {
  it('абсолютный путь - вне проекта, путь от корня - нет', () => {
    expect(isOutsidePath('/Users/max/.claude/plans/a.md')).toBe(true)
    expect(isOutsidePath('src/app/main.tsx')).toBe(false)
    expect(isOutsidePath('.claude/rules/x.md')).toBe(false)
  })
})

describe('displayPath', () => {
  it('домашняя папка - через ~', () => {
    expect(displayPath('/Users/max/Documents/Projects/x', '/Users/max')).toBe(
      '~/Documents/Projects/x',
    )
  })

  it('похожий префикс и чужие пути - как есть', () => {
    expect(displayPath('/Users/maxim/x', '/Users/max')).toBe('/Users/maxim/x')
    expect(displayPath('/opt/x', undefined)).toBe('/opt/x')
  })
})

describe('isInsideAny', () => {
  it('сам путь и всё под ним, но не соседи с тем же началом имени', () => {
    expect(isInsideAny('src', ['src'])).toBe(true)
    expect(isInsideAny('src/app/deep', ['docs', 'src'])).toBe(true)
    expect(isInsideAny('srcx/app', ['src'])).toBe(false)
    expect(isInsideAny('src', [])).toBe(false)
  })
})

describe('movedPathOf', () => {
  it('сам путь и всё внутри - на новом месте, соседи с тем же началом - на старом', () => {
    expect(movedPathOf('src', 'src', 'lib')).toBe('lib')
    expect(movedPathOf('src/a/b.ts', 'src', 'lib/src')).toBe('lib/src/a/b.ts')
    expect(movedPathOf('srcx/a.ts', 'src', 'lib')).toBe('srcx/a.ts')
  })
})

describe('пути Windows (ADR 0048)', () => {
  it('диск и сетевой путь - вне проекта', () => {
    expect(isOutsidePath('C:\\Users\\me\\notes.md')).toBe(true)
    expect(isOutsidePath('d:/work/a.ts')).toBe(true)
    expect(isOutsidePath('\\\\server\\share\\a.ts')).toBe(true)
  })

  it('имя и папка - по любой черте', () => {
    expect(baseName('C:\\Users\\me\\repo')).toBe('repo')
    expect(splitPath('C:\\Users\\me\\a.ts')).toEqual({ folder: 'C:\\Users\\me', name: 'a.ts' })
  })

  it('на маке обратная черта в имени - буква, а не черта', () => {
    expect(baseName('src/a\\b.ts')).toBe('a\\b.ts')
  })

  it('домашняя папка - через ~', () => {
    expect(displayPath('C:\\Users\\me\\repo', 'C:\\Users\\me')).toBe('~\\repo')
    expect(displayPath('C:\\Users\\meg\\repo', 'C:\\Users\\me')).toBe('C:\\Users\\meg\\repo')
  })

  it('элемент проекта - чертой системы корня', () => {
    expect(joinRoot('C:\\repo', 'src/a.ts')).toBe('C:\\repo\\src\\a.ts')
    expect(joinRoot('/Users/me/repo', 'src/a.ts')).toBe('/Users/me/repo/src/a.ts')
    expect(joinRoot('C:\\repo', '')).toBe('C:\\repo')
  })

  it('путь от корня - без учёта регистра диска и вида черт, через «/»', () => {
    expect(relativeTo('c:/repo/src/a.ts', 'C:\\repo')).toBe('src/a.ts')
    expect(relativeTo('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts')
    expect(relativeTo('C:\\repo2\\a.ts', 'C:\\repo')).toBe('C:\\repo2\\a.ts')
    expect(relativeTo('/p/src/a.ts', '/p')).toBe('src/a.ts')
  })
})

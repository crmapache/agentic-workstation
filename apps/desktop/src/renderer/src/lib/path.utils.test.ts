import { it, expect, describe } from 'vitest'

import {
  baseName,
  splitPath,
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

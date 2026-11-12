import { it, expect, describe } from 'vitest'

import type { EditorTabs } from './editor-tabs.types'
import {
  NO_TABS,
  openTab,
  activeTab,
  closeTabs,
  movedTabs,
  tabsUnder,
  tabTarget,
  diffTabKey,
  restoreTabs,
  pathsLeaving,
  historyTabKey,
  openSingleTab,
} from './editor-tabs.utils'

const NONE = new Set<string>()

const openAll = (paths: readonly string[], limit = 30, held = NONE): EditorTabs =>
  paths.reduce((tabs, path) => openTab(tabs, path, { limit, held }), NO_TABS)

describe('openTab', () => {
  it('новый файл - в конец и активный; открытый - активный на своём месте', () => {
    const tabs = openAll(['a.ts', 'b.ts', 'c.ts', 'a.ts'])

    expect(tabs.keys).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(activeTab(tabs)).toBe('a.ts')
  })

  it('сверх предела закрывается самый первый открытый, а не давно не выбиранный', () => {
    const tabs = openAll(['a.ts', 'b.ts', 'c.ts', 'a.ts', 'd.ts'], 3)

    expect(tabs.keys).toEqual(['b.ts', 'c.ts', 'd.ts'])
    expect(tabs.recent).toEqual(['b.ts', 'c.ts', 'd.ts'])
  })

  it('тридцать первый файл закрывает первый', () => {
    const paths = Array.from({ length: 31 }, (_, index) => `file${index + 1}.ts`)
    const tabs = openAll(paths)

    expect(tabs.keys).toHaveLength(30)
    expect(tabs.keys[0]).toBe('file2.ts')
    expect(activeTab(tabs)).toBe('file31.ts')
  })

  it('удерживаемую вкладку переполнение пропускает', () => {
    const held = new Set(['a.ts'])
    const tabs = openTab(openAll(['a.ts', 'b.ts', 'c.ts']), 'd.ts', { limit: 3, held })

    expect(tabs.keys).toEqual(['a.ts', 'c.ts', 'd.ts'])
  })

  it('удерживаются все - полоса временно длиннее предела', () => {
    const held = new Set(['a.ts', 'b.ts'])
    const tabs = openTab(openAll(['a.ts', 'b.ts']), 'c.ts', { limit: 2, held })

    expect(tabs.keys).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })
})

describe('openSingleTab', () => {
  const options = { limit: 30, held: NONE }

  it('разница другого файла встаёт на место прежней и становится активной', () => {
    const first = openSingleTab(openAll(['a.ts', 'b.ts']), { kind: 'diff', path: 'a.ts' }, options)
    const tabs = openSingleTab(
      openTab(first, 'c.ts', options),
      { kind: 'diff', path: 'b.ts' },
      options,
    )

    expect(tabs.keys).toEqual(['a.ts', 'b.ts', diffTabKey('b.ts'), 'c.ts'])
    expect(activeTab(tabs)).toBe(diffTabKey('b.ts'))
    expect(tabs.recent).toEqual(['a.ts', 'b.ts', 'c.ts', diffTabKey('b.ts')])
  })

  it('разницу с несохранённым файлом переполнение тоже пропускает', () => {
    const held = new Set(['a.ts'])
    const withDiff = openSingleTab(NO_TABS, { kind: 'diff', path: 'a.ts' }, options)
    const tabs = openAll(['b.ts', 'c.ts']).keys.reduce(
      (open, key) => openTab(open, key, { limit: 2, held }),
      withDiff,
    )

    expect(tabs.keys).toEqual([diffTabKey('a.ts'), 'c.ts'])
  })

  it('ключ разницы не путается с файлом, путь из него достаётся целиком', () => {
    expect(tabTarget(diffTabKey('src/diff'))).toEqual({ kind: 'diff', path: 'src/diff' })
    expect(tabTarget('src/diff')).toEqual({ kind: 'file', path: 'src/diff' })
  })

  it('история одна на проект, как разница, и не путается ни с файлом, ни с разницей', () => {
    const first = openSingleTab(openAll(['a.ts']), { kind: 'history', path: 'a.ts' }, options)
    const withDiff = openSingleTab(first, { kind: 'diff', path: 'a.ts' }, options)
    const tabs = openSingleTab(withDiff, { kind: 'history', path: '' }, options)

    expect(tabs.keys).toEqual(['a.ts', historyTabKey(''), diffTabKey('a.ts')])
    expect(tabTarget(historyTabKey(''))).toEqual({ kind: 'history', path: '' })
    expect(tabTarget(historyTabKey('src'))).toEqual({ kind: 'history', path: 'src' })
  })

  it('история папки едет с переносом и остаётся, когда папку убрали в корзину', () => {
    const tabs = openSingleTab(openAll(['src/a.ts']), { kind: 'history', path: 'src' }, options)

    expect(movedTabs(tabs, 'src', 'lib').keys).toEqual(['lib/a.ts', historyTabKey('lib')])
    expect(tabsUnder(tabs, 'src')).toEqual(['src/a.ts'])
  })
})

describe('closeTabs', () => {
  it('закрыл активную - открывается та, что была активна до неё', () => {
    const tabs = openAll(['a.ts', 'b.ts', 'c.ts', 'a.ts'])

    expect(activeTab(closeTabs(tabs, ['a.ts']))).toBe('c.ts')
    expect(activeTab(closeTabs(tabs, ['a.ts', 'c.ts']))).toBe('b.ts')
  })

  it('закрыл не активную - активная та же; последнюю - вкладок нет', () => {
    const tabs = openAll(['a.ts', 'b.ts'])

    expect(activeTab(closeTabs(tabs, ['a.ts']))).toBe('b.ts')
    expect(activeTab(closeTabs(tabs, ['a.ts', 'b.ts']))).toBeUndefined()
  })
})

describe('pathsLeaving', () => {
  it('файл уходит, только если не остаётся ни его вкладки, ни разницы с ним', () => {
    const tabs = openSingleTab(
      openAll(['a.ts', 'b.ts']),
      { kind: 'diff', path: 'a.ts' },
      { limit: 30, held: NONE },
    )

    expect(pathsLeaving(tabs, ['a.ts'])).toEqual([])
    expect(pathsLeaving(tabs, ['a.ts', diffTabKey('a.ts'), 'b.ts'])).toEqual(['a.ts', 'b.ts'])
  })
})

describe('restoreTabs', () => {
  it('мусор - пустая полоса; recent чинится по открытым', () => {
    expect(restoreTabs(null)).toEqual(NO_TABS)
    expect(restoreTabs({ keys: ['a.ts', 'b.ts', 'b.ts', 3], recent: ['b.ts', 'gone.ts'] })).toEqual(
      { keys: ['a.ts', 'b.ts'], recent: ['a.ts', 'b.ts'] },
    )
  })
})

describe('перенос в дереве', () => {
  it('вкладки файла, разницы и всего внутри папки едут на новое место, выбор прежний', () => {
    const tabs = {
      keys: ['src/a.ts', diffTabKey('src/b.ts'), 'srcx/c.ts', 'README.md'],
      recent: ['README.md', 'src/a.ts'],
    }

    expect(movedTabs(tabs, 'src', 'lib')).toEqual({
      keys: ['lib/a.ts', diffTabKey('lib/b.ts'), 'srcx/c.ts', 'README.md'],
      recent: ['README.md', 'lib/a.ts'],
    })
    expect(tabsUnder(tabs, 'src')).toEqual(['src/a.ts', diffTabKey('src/b.ts')])
  })
})

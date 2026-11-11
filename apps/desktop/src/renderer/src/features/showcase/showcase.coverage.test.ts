import { it, expect, describe } from 'vitest'

import {
  RADII,
  SPACES,
  SHADOWS,
  FONT_SIZES,
  FONT_WEIGHTS,
  VALUE_TOKENS,
} from './FoundationsView/FoundationsView.constants'

/*
 * Дизайн-система расширяется только так, чтобы новое было видно и описано: новый
 * примитив - образец в витрине и строка в README пакета, новый цвет, кегль, отступ,
 * радиус или тень - образец на вкладке «Основа». Забыл - тест скажет, что именно.
 *
 * Исходники берёт сборщик (import.meta.glob), а не node:fs: окну Node запрещён, и
 * тест живёт по тем же правилам, что и код рядом.
 */

const componentModules = import.meta.glob('../../../../../../../packages/ui/src/components/*/*.tsx')

const showcaseSources = import.meta.glob<string>('./**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const [readme = ''] = Object.values(
  import.meta.glob<string>('../../../../../../../packages/ui/README.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)

const [tokensCss = ''] = Object.values(
  import.meta.glob<string>('../../../../../../../packages/ui/src/styles/tokens.css', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)

/** Примитив - папка Name с файлом Name.tsx внутри. */
const components = Object.keys(componentModules)
  .map((path) => path.split('/').slice(-2))
  .filter(([folder, file]) => file === `${folder}.tsx`)
  .map(([folder]) => folder ?? '')

const showcaseCode = Object.values(showcaseSources).join('\n')

/** Токены, которые витрина обязана показывать: роли цвета и шкалы. */
const SHOWN_TOKEN_PATTERN = /^\s*(--(?:color|font-size|font-weight|space|radius|shadow)-[\w-]+):/gm

describe('витрина и README покрывают дизайн-систему', () => {
  it('исходники найдены - иначе остальные проверки прошли бы впустую', () => {
    expect(components.length).toBeGreaterThan(10)
    expect(readme).not.toBe('')
    expect(tokensCss).not.toBe('')
  })

  it('каждый примитив есть в витрине', () => {
    const missing = components.filter(
      (name) => !showcaseCode.includes(`from '@agentic-workstation/ui/${name}'`),
    )

    expect(missing, 'добавь образец в features/showcase/ComponentsView').toEqual([])
  })

  it('каждый примитив описан в README пакета', () => {
    const missing = components.filter((name) => !readme.includes(`\`src/components/${name}\``))

    expect(missing, 'добавь строку в таблицу packages/ui/README.md').toEqual([])
  })

  it('каждая роль цвета и каждая ступень шкал показаны на вкладке «Основа»', () => {
    const shown = new Set<string>([
      ...VALUE_TOKENS,
      ...FONT_SIZES,
      ...FONT_WEIGHTS,
      ...SPACES,
      ...RADII,
      ...SHADOWS,
    ])
    const declared = [...tokensCss.matchAll(SHOWN_TOKEN_PATTERN)].map(([, name]) => name ?? '')
    const missing = declared.filter((name) => !shown.has(name))

    expect(missing, 'добавь токен в FoundationsView.constants.ts').toEqual([])
  })
})

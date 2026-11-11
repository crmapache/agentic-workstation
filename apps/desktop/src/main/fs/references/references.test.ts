import { it, expect, describe } from 'vitest'

import type { FileMove } from '@shared/file-ops'

import { parseJsonc, pathAliases } from './path-aliases'
import { applyEdits, projectIndex, planReferences } from './reference-plan'

/**
 * Переименование и перенос в дереве переписывают ссылки, как WebStorm: импорты, синонимы
 * tsconfig, стили, Markdown - в той же форме, в какой они были записаны.
 */

/** Проект из файлов с текстом: план правок и тексты после них. */
const project = (files: Record<string, string>, configs: string[] = []) => {
  const index = projectIndex(Object.keys(files))
  const read = (path: string) => files[path] ?? null
  const aliases = pathAliases(configs, read)

  return (move: FileMove) => {
    const plan = planReferences(index, aliases, move, read)

    return Object.fromEntries(
      plan.map((file) => [file.path, applyEdits(files[file.path] ?? '', file.edits)]),
    )
  }
}

describe('ссылки при переименовании и переносе', () => {
  it('файл: импорты без расширения, с ним, побочные, require и подмена в тестах', () => {
    const rename = project({
      'src/ui/Foo.tsx': 'export const Foo = 1',
      'src/ui/Foo.module.scss': '.a {}',
      'src/ui/Panel.tsx':
        "import { Foo } from './Foo'\nimport styles from './Foo.module.scss'\nimport './Foo.tsx'",
      'src/app.ts': "const a = require('./ui/Foo')\nvi.mock('./ui/Foo', () => ({}))",
      'src/other/Foo.ts': 'export {}',
      'src/other/use.ts': "import { x } from './Foo'\nimport React from 'react'",
    })

    expect(rename({ from: 'src/ui/Foo.tsx', to: 'src/ui/Bar.tsx' })).toEqual({
      'src/ui/Panel.tsx':
        "import { Foo } from './Bar'\nimport styles from './Foo.module.scss'\nimport './Bar.tsx'",
      'src/app.ts': "const a = require('./ui/Bar')\nvi.mock('./ui/Bar', () => ({}))",
    })
  })

  it('папка: пути через неё и импорт её index', () => {
    const rename = project({
      'src/comp/index.ts': "export * from './Button'",
      'src/comp/Button.tsx': 'export {}',
      'src/pages/Home.tsx': "import { Button } from '../comp'\nimport x from '../comp/Button'",
    })

    expect(rename({ from: 'src/comp', to: 'src/widgets' })).toEqual({
      'src/pages/Home.tsx':
        "import { Button } from '../widgets'\nimport x from '../widgets/Button'",
    })
  })

  it('синоним из tsconfig остаётся синонимом, extends и комментарии - как у TypeScript', () => {
    const rename = project(
      {
        'apps/desktop/tsconfig.base.json':
          '{ /* общий */ "compilerOptions": { "paths": { "@shared/*": ["src/shared/*"] }, } }',
        'apps/desktop/tsconfig.web.json': '{ "extends": "./tsconfig.base" }',
        'apps/desktop/src/shared/claude.ts': 'export {}',
        'apps/desktop/src/renderer/a.ts': "import type { X } from '@shared/claude'",
        'apps/phone/src/b.ts': "import type { X } from '@shared/claude'",
      },
      ['apps/desktop/tsconfig.base.json', 'apps/desktop/tsconfig.web.json'],
    )

    expect(
      rename({ from: 'apps/desktop/src/shared/claude.ts', to: 'apps/desktop/src/shared/agent.ts' }),
    ).toEqual({ 'apps/desktop/src/renderer/a.ts': "import type { X } from '@shared/agent'" })
  })

  it('перенос в другую папку: и ссылки на файл, и его собственные пути', () => {
    const move = project({
      'src/a/util.ts': "import { b } from '../b/b'\nimport { c } from './c'",
      'src/a/c.ts': 'export {}',
      'src/b/b.ts': "import { u } from '../a/util'",
    })

    expect(move({ from: 'src/a/util.ts', to: 'src/b/util.ts' })).toEqual({
      'src/a/util.ts': "import { b } from './b'\nimport { c } from '../a/c'",
      'src/b/b.ts': "import { u } from './util'",
    })
  })

  it('стили: частичный файл без подчёркивания и расширения, url()', () => {
    const rename = project({
      'ui/_mixins.scss': '@mixin a {}',
      'ui/logo.png': '',
      'ui/button.scss': "@use 'mixins' as *;\n.b { background: url('./logo.png'); }",
    })

    expect(rename({ from: 'ui/_mixins.scss', to: 'ui/_tools.scss' })).toEqual({
      'ui/button.scss': "@use 'tools' as *;\n.b { background: url('./logo.png'); }",
    })
    expect(rename({ from: 'ui/logo.png', to: 'ui/mark.png' })).toEqual({
      'ui/button.scss': "@use 'mixins' as *;\n.b { background: url('./mark.png'); }",
    })
  })

  it('Markdown: ссылка с якорем, картинка, от корня; адреса не трогаются', () => {
    const rename = project({
      'docs/adr/0001.md': 'x',
      'docs/a b.png': '',
      'README.md':
        '[ADR](docs/adr/0001.md#why) ![p](docs/a%20b.png) [w](https://x.dev/docs/adr/0001.md)',
      'docs/index.md': '[root](/docs/adr/0001.md)',
    })

    expect(rename({ from: 'docs/adr/0001.md', to: 'docs/adr/0001-start.md' })).toEqual({
      'README.md':
        '[ADR](docs/adr/0001-start.md#why) ![p](docs/a%20b.png) [w](https://x.dev/docs/adr/0001.md)',
      'docs/index.md': '[root](/docs/adr/0001-start.md)',
    })
    expect(rename({ from: 'docs/a b.png', to: 'docs/c d.png' })['README.md']).toContain(
      '![p](docs/c%20d.png)',
    )
  })

  it('ESM в TypeScript: «.js» у файла .ts и хвост «?inline» переезжают как есть', () => {
    const rename = project({
      'src/util.ts': 'export {}',
      'src/overlay.css': '',
      'src/main.ts': "import { u } from './util.js'\nimport css from './overlay.css?inline'",
    })

    expect(rename({ from: 'src/util.ts', to: 'src/helpers.ts' })).toEqual({
      'src/main.ts': "import { u } from './helpers.js'\nimport css from './overlay.css?inline'",
    })
    expect(rename({ from: 'src/overlay.css', to: 'src/layer.css' })).toEqual({
      'src/main.ts': "import { u } from './util.js'\nimport css from './layer.css?inline'",
    })
  })

  it('папка со своим tsconfig переезжает вместе с синонимом: «@/x» остаётся «@/x»', () => {
    const rename = project(
      {
        'apps/web/tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
        'apps/web/src/ui/Button.tsx': 'export {}',
        'apps/web/src/app.tsx': "import { Button } from '@/ui/Button'",
      },
      ['apps/web/tsconfig.json'],
    )

    expect(rename({ from: 'apps/web', to: 'apps/site' })).toEqual({})
  })

  it('регистр в git отстал от диска: файл и ссылки находятся без учёта регистра', () => {
    const rename = project({
      'src/button.tsx': 'export {}',
      'src/app.tsx': "import { Button } from './Button'",
    })

    expect(rename({ from: 'src/Button.tsx', to: 'src/Knob.tsx' })).toEqual({
      'src/app.tsx': "import { Button } from './Knob'",
    })
  })

  it('Markdown: путь в подписи ссылки не трогается, пробел в новом пути кодируется', () => {
    const rename = project({
      'docs/spec.md': 'x',
      'README.md': '[s](docs/spec.md "see docs/spec.md")',
    })

    expect(rename({ from: 'docs/spec.md', to: 'docs/My Spec.md' })).toEqual({
      'README.md': '[s](docs/My%20Spec.md "see docs/spec.md")',
    })
  })

  it('правка не ложится, если файл поменялся после расчёта', () => {
    expect(
      applyEdits('import x from "./b"', [{ start: 15, end: 18, was: './a', now: './c' }]),
    ).toBe(null)
  })

  it('JSON с комментариями: «//» внутри строки - не комментарий', () => {
    expect(parseJsonc('{ "a": "https://x" // c\n, "b": [1,], }')).toEqual({
      a: 'https://x',
      b: [1],
    })
  })
})

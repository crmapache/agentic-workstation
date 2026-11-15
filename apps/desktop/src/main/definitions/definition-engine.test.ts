import { rmSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { DefinitionEngine } from './definition-engine'
import { tsPath } from './script-files'

const FILES: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
      paths: { '@/*': ['./src/*'] },
    },
  }),
  'src/lib/math.ts': 'export const add = (a: number, b: number) => a + b\n',
  'src/lib/types.ts': 'export interface Shape {\n  size: number\n}\n',
  'src/lib/index.ts': "export * from './math'\nexport type { Shape } from './types'\n",
  'src/lib/default.ts': 'const make = () => 1\nexport default make\n',
  'src/styles.module.scss': '.a { color: red; }\n',
  'node_modules/pkg/package.json': JSON.stringify({ name: 'pkg', types: 'index.d.ts' }),
  'node_modules/pkg/index.d.ts': "export * from './inner'\n",
  'node_modules/pkg/inner.d.ts': 'export declare function widget(): void\n',
  'node_modules/legacy/package.json': JSON.stringify({ name: 'legacy', types: 'index.d.ts' }),
  'node_modules/legacy/index.d.ts':
    'export = Legacy\ndeclare namespace Legacy {\n  function useThing(): void\n}\n',
  'src/cjs.js': "const { add } = require('./lib/math')\nmodule.exports = add\n",
}

const APP = [
  "import { add, type Shape } from '@/lib'",
  "import make from './lib/default'",
  "import * as math from './lib/math'",
  "import { widget } from 'pkg'",
  "import { useThing } from 'legacy'",
  "import styles from './styles.module.scss'",
  '',
  'const total = add(1, 2)',
  'const area = (shape: Shape) => {',
  '  const total = shape.size',
  '  return total + make() + math.add(1, 1)',
  '}',
  'widget()',
  'useThing()',
  'console.log(total, area, styles)',
].join('\n')

let root = ''
let app = ''

/** Спросить про n-е вхождение слова в тексте приложения (с 0). */
const ask = (engine: DefinitionEngine, word: string, nth = 0, file = app, text = APP) => {
  let offset = -1

  for (let index = 0; index <= nth; index += 1) offset = text.indexOf(word, offset + 1)

  return engine.find({ file, version: '1', offset, text })
}

const target = (answer: ReturnType<DefinitionEngine['find']>) =>
  answer.kind === 'found'
    ? { file: answer.target.file.slice(root.length + 1), line: answer.target.line }
    : answer.kind

beforeAll(() => {
  // Настоящий путь папки: на macOS временная папка лежит за ссылкой /var → /private/var.
  root = tsPath(realpathSync(mkdtempSync(join(tmpdir(), 'definitions-'))))
  app = `${root}/src/app.ts`

  for (const [path, text] of Object.entries({ ...FILES, 'src/app.ts': APP })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('DefinitionEngine', () => {
  it('asks for the text it has not seen', () => {
    const engine = new DefinitionEngine()

    expect(engine.find({ file: app, version: '7', offset: 0 })).toEqual({ kind: 'needText' })
  })

  it('finds locals by scope, with shadowing', () => {
    const engine = new DefinitionEngine()

    // total в теле area - его собственный, а не верхний.
    expect(target(ask(engine, 'total', 2))).toEqual({ file: 'src/app.ts', line: 10 })
    expect(target(ask(engine, 'total', 3))).toEqual({ file: 'src/app.ts', line: 8 })
    expect(target(ask(engine, 'shape', 1))).toEqual({ file: 'src/app.ts', line: 9 })
  })

  it('has no link on the declaration itself', () => {
    expect(ask(new DefinitionEngine(), 'area', 0)).toEqual({ kind: 'none' })
  })

  it('follows imports through aliases and export * to the declaration', () => {
    const engine = new DefinitionEngine()

    expect(target(ask(engine, 'add', 1))).toEqual({ file: 'src/lib/math.ts', line: 1 })
    expect(target(ask(engine, 'add', 0))).toEqual({ file: 'src/lib/math.ts', line: 1 })
    expect(target(ask(engine, 'Shape', 1))).toEqual({ file: 'src/lib/types.ts', line: 1 })
    expect(target(ask(engine, 'make', 1))).toEqual({ file: 'src/lib/default.ts', line: 1 })
  })

  it('opens the module from the import path and from a namespace member', () => {
    const engine = new DefinitionEngine()

    expect(target(ask(engine, "'@/lib'"))).toEqual({ file: 'src/lib/index.ts', line: 1 })
    expect(target(ask(engine, 'add', 2))).toEqual({ file: 'src/lib/math.ts', line: 1 })
    expect(target(ask(engine, 'styles', 1))).toEqual({ file: 'src/styles.module.scss', line: 1 })
  })

  it('finds names in packages, including export = namespaces', () => {
    const engine = new DefinitionEngine()

    expect(target(ask(engine, 'widget', 1))).toEqual({
      file: 'node_modules/pkg/inner.d.ts',
      line: 1,
    })
    expect(target(ask(engine, 'useThing', 1))).toEqual({
      file: 'node_modules/legacy/index.d.ts',
      line: 3,
    })
  })

  it('follows require in JavaScript', () => {
    const cjs = `${root}/src/cjs.js`
    const text = FILES['src/cjs.js'] ?? ''

    expect(target(ask(new DefinitionEngine(), 'add', 1, cjs, text))).toEqual({
      file: 'src/lib/math.ts',
      line: 1,
    })
  })

  it('underlines the whole path of an import, without quotes', () => {
    const answer = ask(new DefinitionEngine(), 'pkg')

    expect(answer.kind === 'found' && APP.slice(answer.origin.start, answer.origin.end)).toBe('pkg')
  })
})

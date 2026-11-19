import { it, expect, describe } from 'vitest'

import {
  checkPackage,
  canonicalJson,
  isPackagePath,
  PACKAGE_FORMAT,
  compareVersions,
} from './package-format.ts'

const pkg = (
  patch: Record<string, unknown> = {},
  files: Record<string, string> = { 'main.js': 'export {}' },
) => ({
  format: PACKAGE_FORMAT,
  manifest: { id: 'todo', name: 'Todo', version: '1.0.0', apiVersion: 1, ...patch },
  files,
})

describe('пакет расширения', () => {
  it('пропускает пакет и собирает сводку', () => {
    const result = checkPackage(
      pkg(
        { permissions: ['network', 'network'], network: { hosts: ['api.github.com'] } },
        { 'main.js': 'x', 'README.md': '# Todo', 'lib/util.js': 'y' },
      ),
    )

    expect(result).toMatchObject({
      ok: true,
      summary: {
        id: 'todo',
        permissions: ['network'],
        hosts: ['api.github.com'],
        readme: '# Todo',
        icon: 'Puzzle',
      },
    })
  })

  it('отказывает: путь наружу, скрытый файл, бинарь, без входа, незнакомое право', () => {
    expect(checkPackage(pkg({}, { 'main.js': '', '../x.js': '' }))).toMatchObject({ ok: false })
    expect(checkPackage(pkg({}, { 'main.js': '', '.env.json': '' }))).toMatchObject({ ok: false })
    expect(checkPackage(pkg({}, { 'main.js': '', 'img.png': '' }))).toMatchObject({ ok: false })
    expect(checkPackage(pkg({}, { 'other.js': '' }))).toMatchObject({ ok: false })
    expect(checkPackage(pkg({ permissions: ['root'] }))).toMatchObject({ ok: false })
  })

  it('руководство IDE в пакет не идёт', () => {
    expect(isPackagePath('AGENTS.md')).toBe(false)
    expect(isPackagePath('docs/guide.md')).toBe(true)
  })

  it('канонический JSON не зависит от порядка ключей', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } })).toBe(
      canonicalJson({ a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 }),
    )
  })

  it('версии сравниваются по числам, предрелиз - раньше релиза', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
  })
})

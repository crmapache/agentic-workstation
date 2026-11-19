import { it, expect, describe } from 'vitest'

import { hostAllowed, isEmptyGrant, missingGrant, effectiveGrant } from './grants'
import { parseManifest } from './manifest'

const manifest = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'word-count',
    name: 'Word count',
    version: '1.0.0',
    apiVersion: 1,
    ...patch,
  })

describe('parseManifest', () => {
  it('берёт умолчания и собирает просьбу прав', () => {
    const result = parseManifest(
      manifest({
        permissions: ['network', 'files.read', 'network'],
        network: { hosts: ['API.github.com', '*.example.com'] },
      }),
      'word-count',
    )

    expect(result).toEqual({
      ok: true,
      manifest: {
        id: 'word-count',
        name: 'Word count',
        version: '1.0.0',
        description: '',
        icon: 'Puzzle',
        main: 'main.js',
        apiVersion: 1,
        requests: {
          permissions: ['network', 'files.read'],
          hosts: ['api.github.com', '*.example.com'],
          commands: [],
        },
        settings: [],
      },
    })
  })

  it('отказывает: чужой id, неизвестное право, рамки без права, main за папкой, плохой JSON', () => {
    expect(parseManifest(manifest(), 'other')).toMatchObject({ ok: false })
    expect(parseManifest(manifest({ permissions: ['root'] }), 'word-count')).toMatchObject({
      ok: false,
    })
    expect(parseManifest(manifest({ shell: { commands: ['git'] } }), 'word-count')).toMatchObject({
      ok: false,
      detail: 'extension.json: shell.commands needs the "shell" permission.',
    })
    expect(parseManifest(manifest({ main: '../x.js' }), 'word-count')).toMatchObject({ ok: false })
    expect(
      parseManifest(
        manifest({ shell: { commands: ['rm -rf'] }, permissions: ['shell'] }),
        'word-count',
      ),
    ).toMatchObject({ ok: false })
    expect(parseManifest('{', 'word-count')).toMatchObject({ ok: false })
    expect(parseManifest(manifest({ apiVersion: 2 }), 'word-count')).toMatchObject({ ok: false })
  })

  it('не пускает два поля настроек с одним ключом', () => {
    const settings = [
      { key: 'token', type: 'secret', label: 'Token' },
      { key: 'token', type: 'text', label: 'Again' },
    ]

    expect(parseManifest(manifest({ settings }), 'word-count')).toMatchObject({ ok: false })
  })
})

describe('права', () => {
  const requested = {
    permissions: ['network' as const, 'shell' as const],
    hosts: ['a.com'],
    commands: ['git'],
  }

  it('не хватает - всё, что не выдано; выдано шире - ничего не не хватает', () => {
    expect(missingGrant(requested, null)).toEqual(requested)
    expect(
      isEmptyGrant(
        missingGrant(requested, {
          permissions: ['network', 'shell', 'clipboard'],
          hosts: ['a.com', 'b.com'],
          commands: ['git', 'npm'],
        }),
      ),
    ).toBe(true)
    expect(
      missingGrant(requested, { permissions: ['network', 'shell'], hosts: [], commands: ['git'] }),
    ).toEqual({
      permissions: [],
      hosts: ['a.com'],
      commands: [],
    })
  })

  it('действует только то, что и просят, и выдано', () => {
    expect(
      effectiveGrant(
        { permissions: ['network'], hosts: ['a.com'], commands: [] },
        { permissions: ['network', 'shell'], hosts: ['a.com', 'b.com'], commands: ['git'] },
      ),
    ).toEqual({ permissions: ['network'], hosts: ['a.com'], commands: [] })
  })

  it('хост: точное имя и поддомены по звёздочке, но не сам домен и не похожий', () => {
    const hosts = ['api.github.com', '*.example.com']

    expect(hostAllowed(hosts, 'api.github.com')).toBe(true)
    expect(hostAllowed(hosts, 'API.GitHub.com.')).toBe(true)
    expect(hostAllowed(hosts, 'github.com')).toBe(false)
    expect(hostAllowed(hosts, 'a.example.com')).toBe(true)
    expect(hostAllowed(hosts, 'example.com')).toBe(false)
    expect(hostAllowed(hosts, 'badexample.com')).toBe(false)
    expect(hostAllowed(hosts, 'example.com.evil.org')).toBe(false)
  })
})

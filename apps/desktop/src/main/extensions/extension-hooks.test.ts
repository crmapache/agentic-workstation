import { it, expect, describe } from 'vitest'

import { runHooks } from './extension-hooks'
import { ExtensionRuntime } from './extension-runtime'

const runtime = (id: string) =>
  new ExtensionRuntime(
    {
      id,
      name: id,
      version: '1.0.0',
      description: '',
      icon: 'Puzzle',
      main: 'main.js',
      apiVersion: 1,
      requests: { permissions: [], hosts: [], commands: [] },
      settings: [],
    },
    { permissions: [], hosts: [], commands: [] },
  )

describe('runHooks', () => {
  it('переписывает цепочкой и пропускает упавший и пустой ответ', async () => {
    const a = runtime('a')
    const b = runtime('b')
    const c = runtime('c')
    const answers = new Map<ExtensionRuntime, (text: string) => unknown>([
      [a, (text) => `${text} +a`],
      [b, () => Promise.reject(new Error('boom'))],
      [c, (text) => ({ text: `${text} +c` })],
    ])
    const hooks = runHooks(
      [a, b, c].map((item) => ({ runtime: item, handler: 1 })),
      (item, _handler, args) =>
        Promise.resolve(answers.get(item)?.((args[0] as { text: string }).text)),
    )

    await expect(hooks.rewrite({ text: 'hi', conversationId: 'x' })).resolves.toBe('hi +a +c')
  })

  it('охрана: первый отказ с причиной; true - причина от имени расширения; молчание - не отказ', async () => {
    const quiet = runtime('quiet')
    const strict = runtime('strict')

    await expect(
      runHooks([{ runtime: quiet, handler: 1 }], () => Promise.resolve(undefined)).guard({}),
    ).resolves.toBeNull()
    await expect(
      runHooks(
        [quiet, strict].map((item) => ({ runtime: item, handler: 1 })),
        (item) => Promise.resolve(item === strict ? { deny: 'No force push.' } : null),
      ).guard({}),
    ).resolves.toBe('No force push.')
    await expect(
      runHooks([{ runtime: strict, handler: 1 }], () => Promise.resolve({ deny: true })).guard({}),
    ).resolves.toBe('Blocked by the "strict" extension.')
  })
})

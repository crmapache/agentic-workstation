import { it, expect, describe } from 'vitest'

import type { DefinitionAsk } from './definition-link'
import { DefinitionService } from './definition-service'

const answering = (file: string): DefinitionAsk => ({
  request: () =>
    Promise.resolve({
      kind: 'found',
      origin: { start: 1, end: 4 },
      target: { file, line: 3, column: 7 },
    }),
})

const question = { version: '1', offset: 2 }

describe('DefinitionService', () => {
  it('names a project file from the root, with slashes', async () => {
    const service = new DefinitionService(answering('/work/app/src/lib/math.ts'))

    expect(await service.find('/work/app', '/work/app/src/a.ts', question)).toEqual({
      kind: 'found',
      origin: { start: 1, end: 4 },
      target: { path: 'src/lib/math.ts', line: 3, column: 7 },
    })
  })

  it('keeps a file outside the project absolute', async () => {
    const service = new DefinitionService(answering('/work/shared/ui/Button.tsx'))
    const answer = await service.find('/work/app', '/work/app/src/a.ts', question)

    expect(answer.kind === 'found' && answer.target.path).toBe('/work/shared/ui/Button.tsx')
  })

  it('answers none when the thread fails', async () => {
    const service = new DefinitionService({
      request: () => Promise.reject(new Error('gone')),
    })

    expect(await service.find('/work/app', '/work/app/src/a.ts', question)).toEqual({
      kind: 'none',
    })
  })
})

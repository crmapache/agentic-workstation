import { it, expect, describe } from 'vitest'

import type { ForkOrigin, Conversation } from '@shared/conversation'

import { freshConversation } from '../agents/panel/panel-state'
import { resolveForkOrigin } from './fork-origin'
import { forkChain, forkLineOf } from './history/fork-anchor'

const line = (value: Record<string, unknown>) => JSON.stringify(value)

/** Источник: два хода, первый начат u1, второй - u2. */
const own = [
  line({ type: 'user', uuid: 'u1', parentUuid: null }),
  line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
  line({ type: 'user', uuid: 'u2', parentUuid: 'a1' }),
  line({ type: 'assistant', uuid: 'a2', parentUuid: 'u2' }),
]

/** Источник источника: то, что форк унёс до своей точки (выше сжатия в своём файле этого нет). */
const inherited = [
  line({ type: 'user', uuid: 'p1', parentUuid: null }),
  line({ type: 'assistant', uuid: 'pa1', parentUuid: 'p1' }),
  line({ type: 'user', uuid: 'p2', parentUuid: 'pa1' }),
  line({ type: 'assistant', uuid: 'pa2', parentUuid: 'p2' }),
]

const parentFork: ForkOrigin = { sourceSessionId: 'grand', sourceTitle: 'Grand', at: 'pa2' }

const conversation = (fork: ForkOrigin | null): Conversation =>
  freshConversation({
    id: 'c1',
    projectPath: '/p',
    sessionId: 'src',
    title: 'Source',
    model: null,
    effort: null,
    permissionMode: 'default',
    queue: [],
    fork,
    updatedAt: 0,
  })

/** Строки файла так, как их отдаёт чтение с диска: сведения о строках без отрезанного откатом. */
const chain = (lines: readonly string[] | null) => lines && forkChain(lines.map(forkLineOf))

const files = (ownLines: readonly string[] | null, inheritedLines: readonly string[] | null) => ({
  own: () => Promise.resolve(chain(ownLines)),
  inherited: () => Promise.resolve(chain(inheritedLines)),
})

describe('откуда пойдёт форк', () => {
  it('весь разговор - до последней строки', async () => {
    await expect(resolveForkOrigin(conversation(null), null, files(own, null))).resolves.toEqual({
      sourceSessionId: 'src',
      sourceTitle: 'Source',
      at: 'a2',
    })
  })

  it('перед сообщением - до строки над ним', async () => {
    await expect(resolveForkOrigin(conversation(null), 'u2', files(own, null))).resolves.toEqual({
      sourceSessionId: 'src',
      sourceTitle: 'Source',
      at: 'a1',
    })
  })

  it('от первого сообщения нести нечего - чистый разговор', async () => {
    await expect(resolveForkOrigin(conversation(null), 'u1', files(own, null))).resolves.toBeNull()
  })

  it('сообщения нет нигде - разговор целиком и пометка, а не пустой форк', async () => {
    await expect(resolveForkOrigin(conversation(null), 'gone', files(own, null))).resolves.toEqual({
      sourceSessionId: 'src',
      sourceTitle: 'Source',
      at: 'a2',
      whole: true,
    })
  })

  it('сообщение выше сжатия форка - форк от источника источника', async () => {
    await expect(
      resolveForkOrigin(conversation(parentFork), 'p2', files(own, inherited)),
    ).resolves.toEqual({ sourceSessionId: 'grand', sourceTitle: 'Grand', at: 'pa1' })
  })

  it('нерождённый форк режется по унаследованному', async () => {
    await expect(
      resolveForkOrigin(conversation(parentFork), 'p2', files(null, inherited)),
    ).resolves.toEqual({ sourceSessionId: 'grand', sourceTitle: 'Grand', at: 'pa1' })
    await expect(
      resolveForkOrigin(conversation(parentFork), null, files(null, inherited)),
    ).resolves.toEqual(parentFork)
  })

  it('нерождённый форк без сообщения в унаследованном - всё унаследованное и пометка', async () => {
    await expect(
      resolveForkOrigin(conversation(parentFork), 'gone', files(null, inherited)),
    ).resolves.toEqual({ ...parentFork, whole: true })
  })

  it('пустой разговор не форка - нести нечего', async () => {
    await expect(resolveForkOrigin(conversation(null), 'u1', files(null, null))).resolves.toBeNull()
  })
})

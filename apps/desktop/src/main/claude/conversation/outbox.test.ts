import { it, expect, describe } from 'vitest'

import type { QueuedMessage } from '@shared/conversation'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { ConversationOutbox } from '../../agents/conversation/outbox'

/** Разговор посреди хода: всё, что ставят в очередь, остаётся в ней. */
const busyRuntime = () => {
  const runtime = {
    meta: { queue: [] as QueuedMessage[] },
    isFree: false,
    update(change: { queue?: QueuedMessage[] }) {
      runtime.meta = { ...runtime.meta, ...change }
    },
  }

  return runtime
}

const texts = (runtime: ReturnType<typeof busyRuntime>) =>
  runtime.meta.queue.map((item) => item.text)

const message = (text: string, images = 0) => ({
  text,
  images: Array.from({ length: images }, () => ({ mediaType: 'image/png' as const, data: 'AA' })),
  draft: {
    tokens: [
      { kind: 'text' as const, value: text },
      ...Array.from({ length: images }, (_, index) => ({
        kind: 'chip' as const,
        chip: { kind: 'img' as const, value: `Image #${index + 1}` },
      })),
    ],
    quotes: [],
  },
})

describe('очередь из поля', () => {
  const setup = async () => {
    const runtime = busyRuntime()
    const outbox = new ConversationOutbox(runtime as unknown as ConversationRuntime)

    await outbox.enqueue(message('one'))
    await outbox.enqueue(message('two', 1))
    await outbox.enqueue(message('three'))

    return { runtime, outbox }
  }

  it('вынутое уходит из очереди с кусками и байтами и помнит соседа', async () => {
    const { runtime, outbox } = await setup()
    const [, second] = runtime.meta.queue
    const taken = outbox.takeOut(second?.id ?? '')

    expect(texts(runtime)).toEqual(['one', 'three'])
    expect(taken?.before).toBe(runtime.meta.queue[1]?.id)
    expect(taken?.draft?.tokens[1]).toEqual({
      kind: 'chip',
      chip: { kind: 'img', value: 'Image #1', data: 'data:image/png;base64,AA' },
    })
  })

  it('поправленное встаёт перед прежним соседом; ушёл сосед - в конец', async () => {
    const { runtime, outbox } = await setup()
    const [first, , third] = runtime.meta.queue

    outbox.takeOut(first?.id ?? '')
    await outbox.enqueue(message('one, fixed'), third?.id ?? null)

    expect(texts(runtime)).toEqual(['two', 'one, fixed', 'three'])

    await outbox.enqueue(message('late'), 'gone')

    expect(texts(runtime)).toEqual(['two', 'one, fixed', 'three', 'late'])
  })

  it('перестановка за ручку', async () => {
    const { runtime, outbox } = await setup()
    const [first] = runtime.meta.queue

    outbox.move(first?.id ?? '', 2)

    expect(texts(runtime)).toEqual(['two', 'three', 'one'])

    outbox.move('missing', 0)

    expect(texts(runtime)).toEqual(['two', 'three', 'one'])
  })
})

describe('метка придержанной очереди', () => {
  it('вернувшаяся вкладка: очередь ждёт сообщения человека, и окно это знает', async () => {
    const runtime = busyRuntime()
    const outbox = new ConversationOutbox(runtime as unknown as ConversationRuntime)

    await outbox.enqueue(message('one'))
    outbox.adoptQueue(new Map())

    expect(outbox.isHeld).toBe(true)
    expect((runtime.meta as { queueHold?: string }).queueHold).toBe('reopened')
  })

  it('опустевшая очередь не придержана ничем', async () => {
    const runtime = busyRuntime()
    const outbox = new ConversationOutbox(runtime as unknown as ConversationRuntime)

    await outbox.enqueue(message('one'))
    outbox.adoptQueue(new Map())
    outbox.remove(runtime.meta.queue[0]?.id ?? '')

    expect(outbox.isHeld).toBe(false)
    expect((runtime.meta as { queueHold?: string }).queueHold).toBeUndefined()
  })
})

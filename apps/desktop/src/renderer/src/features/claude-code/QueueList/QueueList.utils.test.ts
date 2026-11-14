import { it, expect, describe } from 'vitest'

import { queueHintKey, queuePictures } from './QueueList.utils'

describe('картинки очереди', () => {
  it('вставленная без файла - по месту среди вставленных; с файлом и выбранная - файлом', () => {
    const queued = (image: number) => ({
      kind: 'queued',
      conversationId: 'c1',
      queuedId: 'q1',
      image,
    })
    const pictures = queuePictures(
      [
        { kind: 'text', value: 'look ' },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #4' } },
        { kind: 'chip', chip: { kind: 'img', value: 'shot.png' } },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #5', path: '/p/pasted.png' } },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #6' } },
      ],
      'c1',
      'q1',
    )

    expect(pictures).toEqual([
      null,
      { place: queued(0) },
      { place: { kind: 'file', path: 'shot.png' }, name: 'shot.png' },
      // Записанную вставку IDE со временем убирает - тогда байты очереди.
      { place: { kind: 'file', path: '/p/pasted.png' }, fallback: queued(1) },
      { place: queued(2) },
    ])
  })
})

describe('подпись очереди', () => {
  it('во время хода - по его концу; без хода - что держит', () => {
    expect(queueHintKey(true, 'reopened')).toBe('claudeCode.queue.hint')
    expect(queueHintKey(false, 'reopened')).toBe('claudeCode.queue.afterReopen')
    expect(queueHintKey(false, 'paused')).toBe('claudeCode.queue.afterYou')
    expect(queueHintKey(false, 'blocked')).toBe('claudeCode.queue.held')
    expect(queueHintKey(false, undefined)).toBe('claudeCode.queue.held')
  })
})

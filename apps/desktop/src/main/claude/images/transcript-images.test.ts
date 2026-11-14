import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { readTranscriptImage } from './transcript-images'

const userLine = (uuid: string, content: unknown[]) =>
  JSON.stringify({ type: 'user', uuid, message: { role: 'user', content } })

// Написанное посреди хода: вложение очереди со своим uuid, наш - в source_uuid (CLI 2.1.293).
const queuedLine = (uuid: string, sourceUuid: string, mode: string, prompt: unknown) =>
  JSON.stringify({
    type: 'attachment',
    uuid,
    attachment: { type: 'queued_command', prompt, source_uuid: sourceUuid, commandMode: mode },
  })

describe('картинка из транскрипта', () => {
  it('по имени сообщения и номеру, только base64-картинки', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'images-'))
    const file = join(dir, 'session.jsonl')

    await writeFile(
      file,
      [
        userLine('m0', [{ type: 'text', text: 'mentions m1 in text' }]),
        userLine('m1', [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } },
          { type: 'text', text: 'two pictures' },
        ]),
      ].join('\n'),
    )

    try {
      await expect(readTranscriptImage(file, 'm1', 0)).resolves.toBe('data:image/png;base64,AAAA')
      await expect(readTranscriptImage(file, 'm1', 1)).resolves.toBe('data:image/jpeg;base64,BBBB')
      await expect(readTranscriptImage(file, 'm1', 2)).resolves.toBeNull()
      await expect(readTranscriptImage(file, 'missing', 0)).resolves.toBeNull()
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('написанное посреди хода - из вложения очереди по нашему uuid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'images-'))
    const file = join(dir, 'session.jsonl')
    const picture = {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'CCCC' },
    }

    await writeFile(
      file,
      [
        queuedLine('line-1', 'note', 'task-notification', [picture]),
        queuedLine('line-2', 'ours', 'prompt', [
          picture,
          { type: 'text', text: '[Image #1] look' },
        ]),
      ].join('\n'),
    )

    try {
      await expect(readTranscriptImage(file, 'ours', 0)).resolves.toBe('data:image/png;base64,CCCC')
      // Свой uuid строки вложения - не имя сообщения, отчёт агента - не слова человека.
      await expect(readTranscriptImage(file, 'line-2', 0)).resolves.toBeNull()
      await expect(readTranscriptImage(file, 'note', 0)).resolves.toBeNull()
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})

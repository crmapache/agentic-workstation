import { it, vi, expect, describe } from 'vitest'

import type { HttpConnectorSpec } from '@shared/connector-spec'

import { SignedOutError } from '../../connector-source'
import { HttpSpecSource } from './http-source'

const spec: HttpConnectorSpec = {
  service: 'Chat',
  baseUrl: 'https://api.chat.dev',
  auth: { type: 'bearer' },
  authHelp: '',
  tools: [
    {
      name: 'list_rooms',
      description: 'List rooms',
      access: 'read',
      method: 'GET',
      path: '/rooms',
      query: [],
      body: [],
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'send_message',
      description: 'Post a message',
      access: 'write',
      method: 'POST',
      path: '/messages',
      query: [],
      body: ['text'],
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    },
  ],
}

const key = () => ({ secret: 'k', username: '' })

const reply = (status: number, body: string) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }))

describe('HttpSpecSource', () => {
  it('ступень строже из двух: «отправить сообщение» - отправка, даже если ИИ сказал запись', async () => {
    const tools = await new HttpSpecSource(spec, key, reply(200, '')).listTools()

    expect(tools.map((tool) => tool.access)).toEqual(['read', 'outbound'])
  })

  it('ответ сервиса уходит модели текстом, ключ - в заголовке', async () => {
    const fetchFn = reply(200, '{"rooms":[1]}')
    const result = await new HttpSpecSource(spec, key, fetchFn).callTool('list_rooms', {})

    expect(result.content).toEqual([{ type: 'text', text: '{"rooms":[1]}' }])
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer k' })
  })

  it('401 - ключ не принят, другой отказ - ошибка с кодом, нет ключа - нужен вход', async () => {
    await expect(
      new HttpSpecSource(spec, key, reply(401, '')).callTool('list_rooms', {}),
    ).rejects.toBeInstanceOf(SignedOutError)
    expect(
      (await new HttpSpecSource(spec, key, reply(500, 'boom')).callTool('list_rooms', {})).isError,
    ).toBe(true)
    await expect(
      new HttpSpecSource(spec, () => null, reply(200, '')).callTool('list_rooms', {}),
    ).rejects.toBeInstanceOf(SignedOutError)
  })

  it('огромный ответ читается только до потолка, а не в память целиком', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(97)
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(endless))
    const result = await new HttpSpecSource(spec, key, fetchFn).callTool('list_rooms', {})
    const [content] = result.content

    expect(pulled).toBeLessThan(1024 * 1024)
    expect(content?.type === 'text' && content.text).toContain('[truncated')
  })

  it('не текст (файл) - пометка без тела', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png', 'content-length': '3' },
      }),
    )
    const result = await new HttpSpecSource(spec, key, fetchFn).callTool('list_rooms', {})

    expect(result.content).toEqual([
      { type: 'text', text: '(image/png response, 3 bytes: not text, not shown)' },
    ])
  })
})

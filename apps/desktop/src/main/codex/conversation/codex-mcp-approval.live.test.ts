import { rm, mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { PendingRequest, PermissionMode } from '@shared/conversation'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { locateCodexCli } from '../cli/codex-locator'
import { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { freshConversation } from '../../agents/panel/panel-state'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import type { CodexHost } from './codex-conversation'
import { codexOf } from './codex-conversation'
import { codexDriver } from './codex-driver'

/**
 * Одобрение вызова MCP на настоящем Codex этой машины (ADR 0131): сервер `notes` с одним
 * пишущим инструментом, разговор в режиме с вопросами. Ходит в сеть OpenAI и тратит лимит,
 * поэтому только по переменной: `AGENTIC_WORKSTATION_CODEX_LIVE=1`.
 */

const PROMPT =
  'Call the save_note tool of the notes MCP server exactly once with text "aw-live". ' +
  'Do not run shell commands. Then reply with the single word DONE.'

/** MCP-сервер по адресу, как шлюз IDE: без сессий, один инструмент без пометки «только чтение». */
const notesServer = async () => {
  const saved: string[] = []
  const http = createServer((request, response) => {
    // Низкоуровневый Server, как у шлюза IDE (gateway.ts): инструмент - готовой JSON Schema.
    const server = new Server({ name: 'notes', version: '1.0.0' }, { capabilities: { tools: {} } })
    const transport = new StreamableHTTPServerTransport()

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        {
          name: 'save_note',
          description: 'Saves a short note for the user.',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          annotations: { readOnlyHint: false },
        },
      ],
    }))
    server.setRequestHandler(CallToolRequestSchema, (call) => {
      const text = call.params.arguments?.['text']

      saved.push(typeof text === 'string' ? text : '')

      return { content: [{ type: 'text', text: 'saved' }] }
    })
    response.on('close', () => {
      void transport.close()
      void server.close()
    })
    void server.connect(transport).then(() => transport.handleRequest(request, response))
  })

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))

  const { port } = http.address() as AddressInfo

  return { saved, url: `http://127.0.0.1:${port}/mcp`, close: () => http.close() }
}

/** Разговор панели Codex с сервером `notes` и всё, что он спросил у человека. */
const conversation = (
  dir: string,
  url: string,
  mode: PermissionMode,
  allowed: readonly string[],
) => {
  const launch: GatewayLaunch = {
    servers: [{ name: 'notes', url }],
    token: 'live',
    allowed,
    own: () => undefined,
    release: () => undefined,
    idle: () => undefined,
    end: () => undefined,
  }
  const asked: PendingRequest[] = []
  const host: CodexHost = {
    driver: codexDriver(() => host),
    cli: () => locateCodexCli(),
    onFeedPatch: () => undefined,
    version: () => '0.0.0',
    model: () => null,
    turns: () => Promise.resolve({ turns: [], nextCursor: null }),
    onUsageChanged: () => undefined,
    connectors: () => launch,
    userMcpServers: () => Promise.resolve([]),
    onChange: () => {
      const { pending } = runtime.meta

      if (pending && !asked.includes(pending)) asked.push(pending)
    },
    onCommands: () => undefined,
    thumbnail: () => '',
    accountId: () => '',
    onCall: () => undefined,
  }
  const runtime = new ConversationRuntime(
    freshConversation({
      id: 'live-mcp',
      projectPath: dir,
      sessionId: '',
      title: '',
      model: null,
      effort: 'low',
      permissionMode: mode,
      queue: [],
      fork: null,
      updatedAt: 0,
    }),
    host,
  )

  return { runtime, asked }
}

describe.skipIf(process.env['AGENTIC_WORKSTATION_CODEX_LIVE'] !== '1')(
  'одобрение вызова MCP у Codex вживую',
  () => {
    it('режим с вопросами: карточка у строки вызова, «разрешить» - вызов доходит', async () => {
      const dir = await mkdtemp(join(homedir(), 'aw-codex-mcp-'))
      const notes = await notesServer()
      const { runtime, asked } = conversation(dir, notes.url, 'acceptEdits', [])

      try {
        await runtime.send({ text: PROMPT, images: [] })
        await expect
          .poll(() => runtime.meta.pending?.kind, { timeout: 120_000, interval: 300 })
          .toBe('permission')

        const pending = runtime.meta.pending
        const tools = codexOf(runtime).feed.builder.items.filter((item) => item.kind === 'tool')

        console.info('[codex mcp live] вопрос', pending)
        expect(pending).toMatchObject({
          kind: 'permission',
          action: { kind: 'mcp', server: 'notes', tool: 'save_note' },
        })
        // Карточка - у строки вызова в ленте, а не сама по себе.
        expect(tools.some((tool) => tool.id === pending?.toolUseId)).toBe(true)

        runtime.respond(pending?.requestId ?? '', {
          kind: 'permission',
          decision: { behavior: 'allow' },
        })
        await expect
          .poll(() => runtime.meta.outcome, { timeout: 120_000, interval: 500 })
          .not.toBe('none')
        expect(runtime.meta.outcome).toBe('done')
        expect(notes.saved).toEqual(['aw-live'])
        expect(asked).toHaveLength(1)
      } finally {
        await runtime.dispose()
        notes.close()
        await rm(dir, { recursive: true, force: true })
      }
    }, 300_000)

    it('сервер из набора «без вопроса» шлюза - вызов без карточки, как у Claude', async () => {
      const dir = await mkdtemp(join(homedir(), 'aw-codex-mcp-'))
      const notes = await notesServer()
      const { runtime, asked } = conversation(dir, notes.url, 'acceptEdits', ['mcp__notes'])

      try {
        await runtime.send({ text: PROMPT, images: [] })
        await expect
          .poll(() => runtime.meta.outcome, { timeout: 120_000, interval: 500 })
          .not.toBe('none')
        expect(runtime.meta.outcome).toBe('done')
        expect(notes.saved).toEqual(['aw-live'])
        expect(asked).toEqual([])
      } finally {
        await runtime.dispose()
        notes.close()
        await rm(dir, { recursive: true, force: true })
      }
    }, 300_000)
  },
)

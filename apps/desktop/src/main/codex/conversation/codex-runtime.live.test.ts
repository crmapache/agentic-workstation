import { rm, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { locateCodexCli } from '../cli/codex-locator'
import { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { freshConversation } from '../../agents/panel/panel-state'
import type { CodexHost } from './codex-conversation'
import { codexOf } from './codex-conversation'
import { codexDriver } from './codex-driver'

/**
 * Разговор на настоящем Codex этой машины: один короткий ход. Ходит в сеть OpenAI и тратит
 * лимит, поэтому только по переменной: `AGENTIC_WORKSTATION_CODEX_LIVE=1`. Папка проекта -
 * временная в домашней.
 */
describe.skipIf(process.env['AGENTIC_WORKSTATION_CODEX_LIVE'] !== '1')(
  'разговор Codex вживую',
  () => {
    it('короткий ход до конца', async () => {
      const dir = await mkdtemp(join(homedir(), 'aw-codex-live-'))
      const host: CodexHost = {
        driver: codexDriver(() => host),
        cli: () => locateCodexCli(),
        onFeedPatch: () => undefined,
        version: () => '0.0.0',
        model: () => null,
        turns: () => Promise.resolve({ turns: [], nextCursor: null }),
        onUsageChanged: () => undefined,
        connectors: () => null,
        userMcpServers: () => Promise.resolve([]),
        onChange: () => undefined,
        onCommands: () => undefined,
        thumbnail: () => '',
        accountId: () => '',
        onCall: () => undefined,
      }
      const runtime = new ConversationRuntime(
        freshConversation({
          id: 'live',
          projectPath: dir,
          sessionId: '',
          title: '',
          model: null,
          effort: 'low',
          permissionMode: 'default',
          queue: [],
          fork: null,
          updatedAt: 0,
        }),
        host,
      )

      try {
        await runtime.send({
          text: 'Reply with the single word OK. Do not run any commands.',
          images: [],
        })
        await expect
          .poll(() => runtime.meta.outcome, { timeout: 120_000, interval: 500 })
          .not.toBe('none')

        const items = codexOf(runtime).feed.builder.items

        console.info(
          '[codex live]',
          runtime.meta.outcome,
          runtime.meta.sessionId,
          items.map((item) => `${item.kind}${item.kind === 'assistant' ? `:${item.text}` : ''}`),
        )
        expect(runtime.meta.outcome).toBe('done')
        expect(items.some((item) => item.kind === 'assistant' && /ok/i.test(item.text))).toBe(true)
      } finally {
        await runtime.dispose()
        await rm(dir, { recursive: true, force: true })
      }
    }, 180_000)
  },
)

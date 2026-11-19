import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { CliMessage } from '../claude/cli/cli-messages'
import { locateCodexCli } from '../codex/cli/codex-locator'
import { locateOpenCodeCli } from '../opencode/cli/opencode-locator'
import type { CardAsk } from '../scenarios/engine/run-mail'
import type { SessionSpawn } from '../scenarios/engine/scenario-session'
import { ScenarioSession } from '../scenarios/engine/scenario-session'
import { titleOf, titlePrompt, TITLE_SCHEMA } from './scenario-titles'
import { askCodexOnce } from './codex/codex-ask'
import { CodexRunProcess } from './codex/codex-run-process'
import { askOpenCodeOnce } from './opencode/opencode-ask'
import { OpenCodeRunProcess } from './opencode/opencode-run-process'

/**
 * Переводчики прогонов на настоящих провайдерах этой машины (docs/plan-providers/50-ide.md).
 * Ходят в сеть и тратят лимит (Codex) или нужна поднятая Ollama с gpt-oss:20b (OpenCode),
 * поэтому только по переменным: `AGENTIC_WORKSTATION_CODEX_LIVE=1`,
 * `AGENTIC_WORKSTATION_OPENCODE_LIVE=1`. Папки - временные в домашней.
 */

/** Сессия движка на процессе провайдера и всё, что она услышала. */
const engineOn = (spawn: SessionSpawn, briefing: string) => {
  const heard: CliMessage[] = []
  const asks: CardAsk[] = []
  const ended: CliMessage[] = []
  const errors: string[] = []
  const engine = new ScenarioSession(
    spawn,
    {
      sessionId: crypto.randomUUID(),
      resume: false,
      model: '',
      effort: 'low',
      permissionMode: 'default',
      briefing,
      accountId: '',
    },
    {
      onMessage: (message) => heard.push(message),
      onTurnStarted: () => undefined,
      onTurnEnded: (result) => ended.push(result),
      onAsk: (ask) => asks.push(ask),
      onWithdrawn: () => undefined,
      onError: (message) => errors.push(message),
      onCrashed: () => errors.push('crashed'),
    },
  )

  return { engine, heard, asks, ended, errors }
}

const LIVE_MS = 240_000

describe.skipIf(process.env['AGENTIC_WORKSTATION_CODEX_LIVE'] !== '1')(
  'прогон на Codex вживую',
  () => {
    it(
      'бриф, ход до конца, вопрос на команду и отказ, имя очереди',
      { timeout: LIVE_MS },
      async () => {
        const dir = await mkdtemp(join(homedir(), 'aw-codex-run-live-'))
        const host = {
          cli: () => locateCodexCli(),
          gateway: () => null,
          userMcpServers: () => Promise.resolve([]),
          version: () => '0.0.0',
          models: () => [],
          journalDir: join(dir, 'journals'),
        }
        const run = engineOn(
          (spec, wires) => new CodexRunProcess(host, spec, { cwd: dir, projectPath: dir }, wires),
          'Whatever you are asked, end your final reply with the word BANANA.',
        )

        try {
          run.engine.sendPrompt('Say hi.')
          await expect.poll(() => run.ended.length, { timeout: LIVE_MS / 2 }).toBe(1)
          expect(run.errors).toEqual([])
          expect(String(run.ended[0]?.['result'])).toMatch(/BANANA/)

          run.engine.sendPrompt('Run exactly this shell command: touch made-by-codex.txt')
          await expect.poll(() => run.asks.length, { timeout: LIVE_MS / 2 }).toBeGreaterThan(0)
          expect(run.asks[0]?.toolName).toBe('Bash')
          run.engine.answer(run.asks[0]?.requestId ?? '', false, 'Not allowed.', {})
          await expect.poll(() => run.ended.length, { timeout: LIVE_MS / 2 }).toBe(2)

          const title = await askCodexOnce(host, '', {
            prompt: titlePrompt('Fix the flaky login test and add retries to the HTTP client'),
            schema: TITLE_SCHEMA,
            model: '',
            effort: 'low',
            cwd: join(dir, 'titles'),
            timeoutMs: 60_000,
          })

          expect('output' in title ? titleOf(title.output) : title).toEqual(expect.any(String))

          // Разовому вопросу команд нет: число байт файла модель знать не может, только угадать.
          const bytes = String((await readFile('/etc/hosts')).length)
          const probe = await askCodexOnce(host, '', {
            prompt:
              'Run the shell command `wc -c < /etc/hosts` and reply with JSON {"title": "<its output>"}.',
            schema: TITLE_SCHEMA,
            model: '',
            effort: 'low',
            cwd: join(dir, 'probe'),
            timeoutMs: 90_000,
          })

          expect('output' in probe ? titleOf(probe.output) : null).not.toBe(bytes)
        } finally {
          run.engine.stop()
          await rm(dir, { recursive: true, force: true })
        }
      },
    )
  },
)

/** Конфиг OpenCode с одной Ollama на этой машине - как панель собирает его для подключения. */
const OLLAMA_CONFIG = JSON.stringify({
  share: 'disabled',
  update: 'disable',
  model: 'ollama/gpt-oss:20b',
  providers: {
    ollama: {
      name: 'Ollama',
      package: '@ai-sdk/openai-compatible',
      settings: { baseURL: 'http://127.0.0.1:11434/v1' },
      models: {
        'gpt-oss:20b': {
          name: 'gpt-oss',
          capabilities: { tools: true },
          limit: { context: 131072, output: 8192 },
          variants: ['low', 'medium', 'high'].map((id) => ({
            id,
            settings: { reasoningEffort: id },
          })),
        },
      },
    },
  },
})

describe.skipIf(process.env['AGENTIC_WORKSTATION_OPENCODE_LIVE'] !== '1')(
  'прогон на открытой модели вживую',
  () => {
    it(
      'бриф указаниями сессии, ход до конца, вопрос на команду',
      { timeout: LIVE_MS },
      async () => {
        const dir = await mkdtemp(join(homedir(), 'aw-opencode-run-live-'))
        const host = {
          cli: () => locateOpenCodeCli(),
          dirs: () => ({
            config: join(dir, 'oc', 'config'),
            data: join(dir, 'oc', 'data'),
            state: join(dir, 'oc', 'state'),
            cache: join(dir, 'oc', 'cache'),
          }),
          launch: () =>
            Promise.resolve({
              config: OLLAMA_CONFIG,
              connectors: null,
              servers: [],
              allowedActions: [],
              env: {},
              compact: false,
              release: () => undefined,
            }),
          models: () => [
            {
              value: 'ollama/gpt-oss:20b',
              displayName: 'gpt-oss:20b',
              description: '',
              efforts: ['low', 'medium', 'high'] as const,
            },
          ],
          messages: () => Promise.resolve({ messages: [], cursor: null }),
          dropBrief: () => Promise.resolve(),
          journalDir: join(dir, 'journals'),
        }
        const run = engineOn(
          (spec, wires) =>
            new OpenCodeRunProcess(host, spec, { cwd: dir, projectPath: dir }, wires),
          'Whatever you are asked, end your final reply with the word BANANA.',
        )

        try {
          run.engine.sendPrompt('Say hi.')
          await expect.poll(() => run.ended.length, { timeout: LIVE_MS / 2 }).toBe(1)
          expect(run.errors).toEqual([])
          expect(String(run.ended[0]?.['result'])).toMatch(/BANANA/)

          run.engine.sendPrompt(
            'Run exactly this shell command with your shell tool: touch made-by-oss.txt',
          )
          await expect.poll(() => run.asks.length, { timeout: LIVE_MS / 2 }).toBeGreaterThan(0)
          expect(run.asks[0]?.toolName).toBe('Bash')
          run.engine.answer(run.asks[0]?.requestId ?? '', false, 'Not allowed.', {})
          await expect.poll(() => run.ended.length, { timeout: LIVE_MS / 2 }).toBe(2)

          const title = await askOpenCodeOnce(host, {
            prompt: titlePrompt('Fix the flaky login test and add retries to the HTTP client'),
            schema: TITLE_SCHEMA,
            model: '',
            effort: 'low',
            cwd: join(dir, 'titles'),
            timeoutMs: 120_000,
          })

          expect('output' in title ? titleOf(title.output) : title).toEqual(expect.any(String))
        } finally {
          run.engine.stop()
          await rm(dir, { recursive: true, force: true })
        }
      },
    )
  },
)

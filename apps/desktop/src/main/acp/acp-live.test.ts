import { rm, mkdir, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { antigravityAgent } from '../antigravity/antigravity-agent'
import { kimiAgent } from '../kimi/kimi-agent'
import type { AcpAgent } from './acp-agent'
import { AcpProcess } from './client/acp-process'
import {
  ACP_PROMPT_TIMEOUT_MS,
  ACP_SESSION_TIMEOUT_MS,
  ACP_CLIENT_CAPABILITIES,
} from './client/acp.constants'
import { AcpFeedBuilder } from './feed/acp-feed-builder'
import type { AcpPromptResult, AcpSessionUpdate } from './protocol/acp-types'

/**
 * Живая проверка ядра ACP на настоящих агентах (ADR 0092) - только руками человека и по
 * переменной: `AGENTIC_WORKSTATION_ACP_LIVE=antigravity` (вход Google в Keychain, один ход на
 * подписке) или `=kimi` (вход Kimi или модель из `KIMI_MODEL_*`, например локальная Ollama).
 * Через наш процесс, указания IDE и ленту: ответ дошёл, а агент знает, что он в IDE.
 */
const LIVE = new Set((process.env['AGENTIC_WORKSTATION_ACP_LIVE'] ?? '').split(','))

/** Переменные модели Kimi из окружения прогона: у оболочки входа их обычно нет. */
const kimiModelEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('KIMI_MODEL_') && typeof entry[1] === 'string',
    ),
  )

/** Один ход в новой сессии; ответ - текст ленты. Папки - в домашней, как у IDE. */
const turn = async (make: (root: string) => AcpAgent, extraEnv: Record<string, string> = {}) => {
  const base = join(homedir(), '.agentic-workstation-acp-live')

  await mkdir(base, { recursive: true })

  const root = await mkdtemp(join(base, 'run-'))
  const project = join(root, 'project')
  const agent = make(root)
  const builder = new AcpFeedBuilder(undefined, Date.now, agent.lens([]), agent.toolId)

  await mkdir(project, { recursive: true })
  await agent.prepare?.()

  const cli = await agent.locate()

  if (!cli) throw new Error(`${agent.tag}: CLI не найден`)

  const launch = agent.launch('default')
  const process_ = new AcpProcess(
    {
      binary: cli.binary,
      args: launch.args,
      cwd: project,
      env: { ...cli.env, ...launch.env, ...extraEnv },
      capabilities: ACP_CLIENT_CAPABILITIES,
      version: 'live-test',
    },
    {
      onNotification: (method, params) => {
        if (method === 'session/update') {
          builder.update((params as { update: AcpSessionUpdate }).update)
        }
      },
      onRequest: () => Promise.resolve({ outcome: { outcome: 'cancelled' } }),
      onExit: () => undefined,
    },
  )

  try {
    await process_.initialized

    const extra = agent.instructions?.(agent.briefing) ?? {}
    const created = (await process_.request(
      'session/new',
      { cwd: project, mcpServers: [], ...extra },
      ACP_SESSION_TIMEOUT_MS,
    )) as { sessionId: string }
    const prompt = 'In one short line: which desktop IDE are you running inside? Name it.'

    builder.addUserMessage('u1', prompt, [], false)
    builder.turnStarted()

    const result = (await process_.request(
      'session/prompt',
      { sessionId: created.sessionId, prompt: [{ type: 'text', text: prompt }] },
      ACP_PROMPT_TIMEOUT_MS,
    )) as AcpPromptResult

    builder.turnCompleted({ stopReason: result.stopReason, error: '' })

    return builder.items
      .flatMap((item) => (item.kind === 'assistant' ? [item.text] : []))
      .join('\n')
  } finally {
    await process_.stop()
    await rm(root, { recursive: true, force: true })
  }
}

describe.skipIf(!LIVE.has('antigravity'))('живой Antigravity', () => {
  it('ход через ядро ACP, указания IDE дописаны к промпту', async () => {
    expect(await turn(antigravityAgent)).toMatch(/Agentic Workstation/i)
  }, 240_000)
})

describe.skipIf(!LIVE.has('kimi'))('живой Kimi Code', () => {
  it('ход через ядро ACP, профиль IDE дописан к промпту', async () => {
    expect(await turn(kimiAgent, kimiModelEnv())).toMatch(/Agentic Workstation/i)
  }, 240_000)
})

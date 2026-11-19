import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FeedItem } from '@shared/conversation-feed'

import type { AcpPanel } from '../../acp/acp-panel'
import type { CliMessage } from '../../claude/cli/cli-messages'
import { ScenarioSession } from '../../scenarios/engine/scenario-session'
import { acpScenarioProvider } from './acp-scenarios'
import { fakeRunHost, installFakeAgent } from './__fixtures__/fake-acp-agent'

const SESSION = '7a1c9e20-5b3d-4f6a-8c2e-9d0f1a2b3c4d'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-scenarios-'))
  await installFakeAgent(dir)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * Панель Kimi без окна: исполнитель берёт у неё хозяина прогона, повтор разговора для журнала
 * шага и открытие разговора вкладкой - всё записывается.
 */
const panelOf = (replayed: FeedItem[] | null) => {
  const seen = { replays: [] as string[], opened: [] as string[] }
  const host = fakeRunHost(dir)
  const panel = {
    agent: host.agent,
    runHost: (journalDir: string) => ({ ...host, journalDir }),
    getState: () => ({ prefs: { newTabModel: 'k3', newTabEffort: 'high' } }),
    isTrusted: () => Promise.resolve(true),
    catalog: {
      replay: (sessionId: string) => {
        seen.replays.push(sessionId)

        return Promise.resolve(replayed)
      },
    },
    openHistory: (cwd: string, sessionId: string) => {
      seen.opened.push(`${cwd}:${sessionId}`)

      return Promise.resolve()
    },
  }

  return { panel: panel as unknown as AcpPanel, seen }
}

/** Прогон одной сессии движка на исполнителе до конца первого хода. */
const runOnce = async (provider: ReturnType<typeof acpScenarioProvider>) => {
  const ended: CliMessage[] = []
  const engine = new ScenarioSession(
    (spec, wires) => provider.spawn(spec, { cwd: dir, projectPath: dir }, wires),
    {
      sessionId: SESSION,
      resume: false,
      model: '',
      effort: 'high',
      permissionMode: 'default',
      briefing: '',
      accountId: '',
    },
    {
      onMessage: () => undefined,
      onTurnStarted: () => undefined,
      onTurnEnded: (result) => ended.push(result),
      onAsk: () => undefined,
      onWithdrawn: () => undefined,
      onError: () => undefined,
      onCrashed: () => undefined,
    },
  )

  engine.sendPrompt('look')
  await expect.poll(() => ended.length).toBe(1)

  return engine
}

describe('Kimi как исполнитель сценариев и заданий', () => {
  it('журнал шага: идущий прогон - журналом прогона, законченный - повтором у агента', async () => {
    const replayed: FeedItem[] = [
      {
        kind: 'assistant',
        id: 'p1-text-1',
        parentToolUseId: null,
        text: 'From the agent.',
        streaming: false,
      },
    ]
    const { panel, seen } = panelOf(replayed)
    const provider = acpScenarioProvider(panel, dir)

    expect(await provider.stepFeed(dir, SESSION)).toBeNull()

    const engine = await runOnce(provider)
    const live = await provider.stepFeed(dir, SESSION)

    await live?.ensureLoaded()
    // Разговор держит прогон: агента не трогаем, лента - из журнала прогона.
    expect(seen.replays).toEqual([])
    expect(
      live?.snapshot().items.some((item) => item.kind === 'user' && item.text === 'look'),
    ).toBe(true)

    engine.stop()
    await expect
      .poll(async () => {
        const done = await provider.stepFeed(dir, SESSION)

        await done?.ensureLoaded()

        return done?.snapshot().items
      })
      .toEqual(replayed)
    expect(seen.replays.at(-1)).toBe('session_1')
    expect(await provider.chatIdOf(SESSION)).toBe('session_1')
  })

  it('агент не отдал разговор - журнал шага из журнала прогона', async () => {
    const { panel, seen } = panelOf(null)
    const provider = acpScenarioProvider(panel, dir)
    const engine = await runOnce(provider)

    engine.stop()
    // Процесс прогона отпускает разговор, когда гаснет: до того повтора у агента не просят.
    await expect
      .poll(async () => {
        const feed = await provider.stepFeed(dir, SESSION)

        await feed?.ensureLoaded()

        return seen.replays.length > 0 ? feed?.snapshot().items : null
      })
      .toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'assistant', text: 'Done.' })]),
      )
  })

  it('продолжить в чате - разговор прогона вкладкой панели', async () => {
    const { panel, seen } = panelOf(null)
    const provider = acpScenarioProvider(panel, dir)

    expect(await provider.openChat(dir, SESSION)).toBe(false)

    const engine = await runOnce(provider)

    engine.stop()
    expect(await provider.openChat(dir, SESSION)).toBe(true)
    expect(seen.opened).toEqual([`${dir}:session_1`])
    expect(provider.defaults()).toEqual({ model: 'k3', effort: 'high' })
  })
})

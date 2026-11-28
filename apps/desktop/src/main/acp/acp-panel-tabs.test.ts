import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { KIMI_CAPABILITIES } from '@shared/panel-capabilities'

import { kimiAgent } from '../kimi/kimi-agent'
import { JsonFile } from '../storage/json-file'
import type { StoredPanel } from '../agents/panel/panel-state'
import { installFakeAgent } from '../providers/acp/__fixtures__/fake-acp-agent'
import type { StoredAcpAccount } from './acp-account'
import { AcpPanel } from './acp-panel'

let dir = ''
let panel: AcpPanel | null = null

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-panel-tabs-'))
  await installFakeAgent(dir)
})

afterEach(async () => {
  await panel?.shutdown()
  panel = null
  await rm(dir, { recursive: true, force: true })
})

/** Панель Kimi без окна на поддельном `kimi acp`. */
const loadPanel = async () => {
  const root = join(dir, 'kimi-root')
  const agent = {
    ...kimiAgent(root),
    locate: () =>
      Promise.resolve({
        binary: join(dir, 'kimi'),
        version: '2.7.0',
        env: process.env as Record<string, string>,
      }),
  }

  panel = await AcpPanel.load(
    new JsonFile<StoredPanel>(join(dir, 'kimi.json')),
    { onState: () => undefined, onFeed: () => undefined, onCall: () => undefined },
    {
      agent,
      capabilities: KIMI_CAPABILITIES,
      root,
      version: '0.0.0',
      accountFile: new JsonFile<StoredAcpAccount>(join(root, 'account.json')),
    },
  )

  return panel
}

const tabsOf = (state: ReturnType<AcpPanel['getState']>, project: string) =>
  state.conversations.filter((one) => one.projectPath === project)

describe('пустые вкладки панели', () => {
  it('у проекта без вкладок - одна запасная, сколько бы окно ни просило', async () => {
    const tabs = await loadPanel()
    const [first] = await Promise.all([
      tabs.ensureConversation('/p/arena'),
      tabs.ensureConversation('/p/arena'),
    ])

    expect(tabsOf(first, '/p/arena')).toHaveLength(1)
    expect(tabsOf(tabs.getState(), '/p/arena')).toHaveLength(1)
    expect(tabsOf(tabs.getState(), '/p/arena')[0]?.spare).toBe(true)
  })

  it('разговор агента встал раньше - пустая рядом не заводится', async () => {
    const tabs = await loadPanel()
    const agentTab = await tabs.openConversation('/p/arena', {})
    const state = await tabs.ensureConversation('/p/arena')

    expect(tabsOf(state, '/p/arena').map((one) => one.id)).toEqual([agentTab])
    expect(tabsOf(state, '/p/arena')[0]?.spare).toBeUndefined()
  })

  it('разговор агента после запасной - запасная помечена, окно её уберёт', async () => {
    const tabs = await loadPanel()

    await tabs.ensureConversation('/p/arena')
    await tabs.openConversation('/p/arena', {})

    expect(tabsOf(tabs.getState(), '/p/arena').map((one) => one.spare === true)).toEqual([
      true,
      false,
    ])
  })

  it('пустая, которую попросил человек (⌘T, «+»), - не запасная', async () => {
    const tabs = await loadPanel()
    const state = await tabs.newConversation('/p/arena')

    expect(tabsOf(state, '/p/arena')[0]?.spare).toBeUndefined()
  })

  it('пустая вкладка, вернувшаяся с диска, - запасная: о ней просили в прошлом запуске', async () => {
    await (await loadPanel()).ensureConversation('/p/arena')
    await panel?.shutdown()

    const again = await loadPanel()

    expect(tabsOf(again.getState(), '/p/arena').map((one) => one.spare)).toEqual([true])
  })
})

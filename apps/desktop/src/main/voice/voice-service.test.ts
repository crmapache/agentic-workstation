import { it, vi, expect, describe } from 'vitest'

import type { Conversation, AgentPanelState } from '@shared/conversation'
import type { VoiceSettings } from '@shared/voice'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import { JsonFile } from '../storage/json-file'
import { Vault } from '../storage/vault'
import type { ConversationsPort } from '../remote/bridge/bridge-ports'
import { VoiceService } from './voice-service'
import { VoiceStore } from './voice-store'

const memoryFile = <T>(value: T | null) => {
  const file = new JsonFile<T>('/nowhere/voice.json')

  vi.spyOn(file, 'read').mockResolvedValue(value)
  vi.spyOn(file, 'write').mockResolvedValue()

  return file
}

const plainCipher = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (data: Buffer) => data.toString(),
}

const port = (conversations: Conversation[] = []) => {
  const state = { conversations } as unknown as AgentPanelState

  return {
    provider: 'claude',
    info: () => ({}),
    getState: () => state,
    getFeed: () =>
      Promise.resolve({ conversationId: 'c1', items: [], tasks: [], hasEarlier: false }),
    newConversation: vi.fn(() => {
      conversations.push({ id: 'c1', status: 'idle', pending: null } as Conversation)

      return Promise.resolve('c1')
    }),
    send: vi.fn(() => Promise.resolve()),
    interrupt: vi.fn(),
    voiceNotice: vi.fn(),
  } as unknown as ConversationsPort & { newConversation: ReturnType<typeof vi.fn> }
}

const setup = async (settings: Partial<VoiceSettings>, key: string | null) => {
  const vault = await Vault.load('/nowhere/voice.vault', plainCipher)
  const store = await VoiceStore.load(memoryFile({ ...DEFAULT_VOICE_SETTINGS, ...settings }), vault)

  vi.spyOn(store, 'key', 'get').mockReturnValue(key)

  const panel = port()
  const service = new VoiceService({
    store,
    panels: () => [panel],
    homePath: () => '/home/.agentic-workstation/home',
    dial: () => ({ send: () => undefined, close: () => undefined }),
    timer: () => () => undefined,
    now: () => 1000,
    checkKey: () => Promise.resolve('ok'),
    onView: () => undefined,
  })

  return { service, store, panel }
}

const endpoint = { origin: 'phone' as const, play: () => undefined, cue: () => undefined }

describe('VoiceService', () => {
  it('refuses a call while voice mode is off or there is no key', async () => {
    expect(await (await setup({ enabled: false }, 'k')).service.start(endpoint)).toEqual({
      ok: false,
      reason: 'off',
    })
    expect(await (await setup({ enabled: true }, null)).service.start(endpoint)).toEqual({
      ok: false,
      reason: 'noKey',
    })
  })

  it('opens a new conversation in Home with the voice permission mode', async () => {
    const { service, panel } = await setup({ enabled: true, permissionMode: 'default' }, 'k')
    const outcome = await service.start(endpoint)

    expect(panel.newConversation).toHaveBeenCalledWith('/home/.agentic-workstation/home', {
      permissionMode: 'default',
    })
    expect(outcome).toMatchObject({
      ok: true,
      call: { conversationId: 'c1', origin: 'phone', provider: 'claude', state: 'listening' },
    })
    expect(service.view().call?.conversationId).toBe('c1')
  })

  it('keeps one call at a time', async () => {
    const { service } = await setup({ enabled: true }, 'k')

    await service.start(endpoint)

    expect(await service.start(endpoint)).toEqual({ ok: false, reason: 'busy' })
  })

  it('forgets the call when it ends', async () => {
    const { service } = await setup({ enabled: true }, 'k')
    const outcome = await service.start(endpoint)

    if (!outcome.ok) throw new Error('no call')
    service.end(outcome.call.id)

    expect(service.view().call).toBeNull()
  })

  it('shows the window only the tail of the key', async () => {
    const { service } = await setup({ enabled: true }, 'abcdefgh1234')

    expect(service.view().key).toEqual({ saved: true, hint: '1234' })
    expect(JSON.stringify(service.view())).not.toContain('abcdefgh')
  })
})

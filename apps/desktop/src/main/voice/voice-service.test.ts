import { it, vi, expect, describe } from 'vitest'

import type { Conversation, AgentPanelState } from '@shared/conversation'
import type { VoiceSettings } from '@shared/voice'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import { JsonFile } from '../storage/json-file'
import { Vault } from '../storage/vault'
import type { ConversationsPort } from '../remote/bridge/bridge-ports'
import { VoiceSamples } from './voice-samples'
import { VoiceService } from './voice-service'
import type { WalkthroughHooks } from './voice-service'
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

const setup = async (
  settings: Partial<VoiceSettings>,
  key: string | null,
  walkthrough?: WalkthroughHooks,
) => {
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
    samples: new VoiceSamples('/nowhere/voice-samples'),
    checkKey: () => Promise.resolve('ok'),
    onView: () => undefined,
    walkthrough,
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

  it('lets only one of two starts in the same moment through', async () => {
    const { service, panel } = await setup({ enabled: true }, 'k')
    const [first, second] = await Promise.all([service.start(endpoint), service.start(endpoint)])

    expect([first.ok, second.ok]).toEqual([true, false])
    expect(second).toEqual({ ok: false, reason: 'busy' })
    expect(panel.newConversation).toHaveBeenCalledTimes(1)
  })

  it('refuses a key that is not shaped like one and ends a call when the key changes', async () => {
    const { service, store } = await setup({ enabled: true }, 'k')

    expect(await service.setKey('Token abc 123')).toEqual({ ok: false, reason: 'malformed' })

    vi.spyOn(store, 'setKey').mockResolvedValue({ ok: true })
    await service.start(endpoint)
    await service.setKey(null)

    expect(service.view().call).toBeNull()
  })

  it('ends a panel call when the window is gone, not a phone one', async () => {
    const { service } = await setup({ enabled: true }, 'k')

    await service.start(endpoint)
    service.endFrom('desktop')
    expect(service.view().call).not.toBeNull()

    service.endFrom('phone')
    expect(service.view().call).toBeNull()
  })

  it('shows the window only the tail of the key', async () => {
    const { service } = await setup({ enabled: true }, 'abcdefgh1234')

    expect(service.view().key).toEqual({ saved: true, hint: '1234' })
    expect(JSON.stringify(service.view())).not.toContain('abcdefgh')
  })
})

describe('VoiceService: walkthrough (ADR 0134)', () => {
  const hooks = (isReady = true) => ({
    isReady: vi.fn(() => isReady),
    started: vi.fn(),
    intercept: vi.fn(() => false),
    drawn: vi.fn(() => 0),
    ended: vi.fn(),
  })
  const request = { provider: 'claude' as const, projectPath: '/work/app', conversationId: null }

  it('refuses a walkthrough the project is not ready for', async () => {
    const { service, panel } = await setup({ enabled: true }, 'k', hooks(false))

    expect(await service.startWalkthrough(endpoint, request)).toEqual({
      ok: false,
      reason: 'walkthroughOff',
    })
    expect(panel.newConversation).not.toHaveBeenCalled()
  })

  it('calls into the chosen conversation, and into a new one of the project without it', async () => {
    const walkthrough = hooks()
    const { service, panel } = await setup({ enabled: true }, 'k', walkthrough)
    const fresh = await service.startWalkthrough(endpoint, request)

    expect(panel.newConversation).toHaveBeenCalledWith('/work/app', {})
    expect(fresh).toMatchObject({ ok: true, call: { conversationId: 'c1', mode: 'walkthrough' } })
    expect(service.walkthroughIn('c1')).not.toBeNull()
    // Панель инструментов человека встаёт с началом показа (ADR 0135), конец знает причину.
    expect(walkthrough.started).toHaveBeenCalledWith('c1')

    service.walkthroughIn('c1')?.end('hangup')
    expect(walkthrough.ended).toHaveBeenCalledWith('c1', 'hangup')
    expect(service.walkthroughIn('c1')).toBeNull()

    const again = await service.startWalkthrough(endpoint, { ...request, conversationId: 'c1' })

    expect(panel.newConversation).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ ok: true, call: { conversationId: 'c1' } })
  })

  it('does not call into a conversation that is gone', async () => {
    const { service } = await setup({ enabled: true }, 'k', hooks())

    expect(
      await service.startWalkthrough(endpoint, { ...request, conversationId: 'gone' }),
    ).toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('keeps a plain call out of the walkthrough', async () => {
    const { service } = await setup({ enabled: true }, 'k', hooks())

    await service.start(endpoint)

    expect(service.walkthroughIn('c1')).toBeNull()
  })
})

describe('VoiceService: reading aloud', () => {
  const sink = { audio: () => undefined, end: () => undefined }
  const request = { id: 'r1', owner: 'desktop', text: 'Почта пуста.', sink }

  it('refuses to read while voice mode is off, without a key or during a call', async () => {
    expect((await setup({ enabled: false }, 'k')).service.read(request)).toBe('off')
    expect((await setup({ enabled: true }, null)).service.read(request)).toBe('noKey')

    const { service } = await setup({ enabled: true }, 'k')

    await service.start(endpoint)
    expect(service.read(request)).toBe('call')
  })

  it('reads when voice mode is on and no call is going', async () => {
    const { service } = await setup({ enabled: true }, 'k')

    expect(service.read(request)).toBeNull()
    service.stopReading('desktop', 'r1')
  })
})

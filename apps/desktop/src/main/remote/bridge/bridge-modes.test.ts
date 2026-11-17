import { it, expect, describe, afterEach } from 'vitest'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { PROJECT_PATH, conversationOf, CONVERSATION_ID } from '../__fixtures__/fake-ide'
import { projectKey } from './project-keys'

afterEach(stopBridges)

const conversationId = CONVERSATION_ID

const PROJECT = projectKey(PROJECT_PATH)

const callsOf = (ide: ReturnType<typeof bridgeSetup>['ide'], name: string) =>
  ide.calls.filter((call) => call.name === name).map((call) => call.args)

describe('режим разговора с телефона (ADR 0076)', () => {
  it('любой режим окна - тем же setOptions, что у меню MODE', async () => {
    const { ide, command } = bridgeSetup()

    for (const mode of ['bypassPermissions', 'auto', 'plan', 'acceptEdits', 'default']) {
      expect(await command('conversation.setMode', { conversationId, mode })).toMatchObject({
        ok: true,
      })
    }

    expect(callsOf(ide, 'setOptions').map(([, options]) => options)).toEqual([
      { permissionMode: 'bypassPermissions' },
      { permissionMode: 'auto' },
      { permissionMode: 'plan' },
      { permissionMode: 'acceptEdits' },
      { permissionMode: 'default' },
    ])
  })

  it('погашенное у окна - отказ modeUnavailable, и до вкладки он не доходит', async () => {
    const { ide, command } = bridgeSetup()
    const setMode = (mode: string) => command('conversation.setMode', { conversationId, mode })
    const unavailable = { ok: false, code: 'refused', detail: 'modeUnavailable' }

    ide.settings.bypassDisabled = true
    expect(await setMode('bypassPermissions')).toMatchObject(unavailable)

    // Отказ CLI: bypass - на всю панель, auto - на модели этого разговора.
    ide.settings.bypassDisabled = false
    ide.state.refusedModes = { bypass: true, autoModels: ['opus'] }
    expect(await setMode('bypassPermissions')).toMatchObject(unavailable)
    expect(await setMode('auto')).toMatchObject(unavailable)
    expect(callsOf(ide, 'setOptions')).toEqual([])

    // Отказ на другой модели auto этому разговору не гасит.
    ide.state.refusedModes = { bypass: false, autoModels: ['haiku'] }
    expect(await setMode('auto')).toMatchObject({ ok: true })
  })

  it('текущий режим не гасится, чужой разговор - notFound', async () => {
    const { ide, command } = bridgeSetup()

    ide.settings.bypassDisabled = true
    ide.state.conversations = [conversationOf({ permissionMode: 'bypassPermissions' })]

    expect(
      await command('conversation.setMode', { conversationId, mode: 'bypassPermissions' }),
    ).toMatchObject({ ok: true })
    expect(
      await command('conversation.setMode', { conversationId: 'nope', mode: 'plan' }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })

  it('состояние разговора и список несут погашенное, отказ CLI доходит до телефона', async () => {
    const { ide, bridge, say, next, sentTo } = bridgeSetup()

    ide.settings.bypassDisabled = true
    say({ k: 'hello' })
    expect((await next('inventory')).projects[0]?.unavailableModes).toEqual({
      claude: ['bypassPermissions'],
    })

    say({ k: 'subscribe', conversationId })
    expect((await next('conversation')).conversation.unavailableModes).toEqual([
      'bypassPermissions',
    ])
    await next('feed')

    // CLI отказался перейти в auto на модели разговора - телефон гасит и его.
    const mark = sentTo().length

    ide.state.refusedModes = { bypass: false, autoModels: ['opus'] }
    bridge.claudeChanged(ide.state)
    expect((await next('conversation', mark)).conversation.unavailableModes).toEqual([
      'auto',
      'bypassPermissions',
    ])
  })
})

describe('новый разговор с телефона - в любом режиме окна', () => {
  const newIn = (permissionMode: string, model?: string) => ({
    projectKey: PROJECT,
    provider: 'claude',
    permissionMode,
    ...(model && { model }),
  })

  it('bypass и auto - как выбрал телефон', async () => {
    const { ide, command } = bridgeSetup()

    expect(await command('conversation.new', newIn('bypassPermissions'))).toMatchObject({
      ok: true,
    })
    expect(ide.state.conversations.at(-1)?.permissionMode).toBe('bypassPermissions')
    expect(callsOf(ide, 'newConversation')[0]?.[1]).toEqual({ permissionMode: 'bypassPermissions' })
  })

  it('bypass под запретом настроек - отказ ещё до вкладки', async () => {
    const { ide, command } = bridgeSetup()

    ide.settings.bypassDisabled = true

    expect(await command('conversation.new', newIn('bypassPermissions'))).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'modeUnavailable',
    })
    expect(callsOf(ide, 'newConversation')).toEqual([])
  })

  it('auto, от которого CLI отказался на модели вкладки, - отказ, и вкладка закрыта', async () => {
    const { ide, command } = bridgeSetup()

    ide.state.refusedModes = { bypass: false, autoModels: ['haiku'] }

    expect(await command('conversation.new', newIn('auto', 'haiku'))).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'modeUnavailable',
    })
    expect(ide.calls.at(-1)).toEqual({ name: 'close', args: ['new-1'] })
    expect(await command('conversation.new', newIn('auto', 'opus'))).toMatchObject({ ok: true })
  })
})

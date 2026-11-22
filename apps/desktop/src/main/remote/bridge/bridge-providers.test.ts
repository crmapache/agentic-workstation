import { it, expect, describe, afterEach } from 'vitest'

import type { SetupPreset } from '@shared/panel-prefs'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { PERMISSION, PROJECT_PATH, CONVERSATION_ID } from '../__fixtures__/fake-ide'
import { addPanel, PANEL_PAST, PANEL_CONVERSATION } from '../__fixtures__/fake-panels'
import { projectKey } from './project-keys'

afterEach(stopBridges)

const PROJECT = projectKey(PROJECT_PATH)

const CODEX = PANEL_CONVERSATION.codex

const OPENCODE = PANEL_CONVERSATION.opencode

/** Мост с тремя панелями: Claude Code из фикстуры IDE, Codex и открытые модели. */
const threePanels = () => {
  const setup = bridgeSetup()
  const codex = addPanel(setup.ide, 'codex')
  const opencode = addPanel(setup.ide, 'opencode')
  const callsOf = (name: string) =>
    setup.ide.calls.filter((call) => call.name === name).map((call) => call.args)

  return { ...setup, codex, opencode, callsOf }
}

const refusedFor = (detail: string) => ({ ok: false, code: 'refused', detail })

describe('список машины - разговоры и провайдеры всех панелей (ADR 0083)', () => {
  it('разговоры каждой панели со своим провайдером, режимы нового разговора - по провайдеру', async () => {
    const { ide, say, next } = threePanels()

    ide.settings.bypassDisabled = true
    say({ k: 'hello' })

    const [open] = (await next('inventory')).projects

    expect(open?.conversations.map((one) => [one.id, one.provider])).toEqual([
      [CONVERSATION_ID, 'claude'],
      [CODEX, 'codex'],
      [OPENCODE, 'opencode'],
    ])
    // Запрет bypass в настройках Claude Code других провайдеров не касается.
    expect(open?.unavailableModes).toEqual({
      claude: ['bypassPermissions'],
      codex: [],
      opencode: [],
    })
  })

  it('у провайдера - его модели с уровнями, усилия, режимы и что он умеет сверх разговора', async () => {
    const { say, next } = threePanels()

    say({ k: 'hello' })

    const { providers } = await next('inventory')
    const [claude, codex, opencode] = providers

    expect(providers.map((one) => one.id)).toEqual(['claude', 'codex', 'opencode'])
    expect(claude).toMatchObject({
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      permissionModes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
      aside: true,
      fastMode: true,
      stopTask: true,
      rewind: true,
      rewindScopes: ['conversation', 'code', 'both'],
    })
    expect(codex).toMatchObject({
      label: 'Codex',
      models: [
        {
          value: 'gpt-5.5',
          label: 'GPT-5.5',
          description: 'Frontier coding',
          fast: true,
          efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        },
      ],
      efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      permissionModes: ['default', 'acceptEdits', 'readOnly', 'plan', 'bypassPermissions'],
      aside: false,
      fastMode: true,
      stopTask: false,
    })
    // Модель без пояснения - именем подключения: одна модель бывает у двух.
    expect(opencode).toMatchObject({
      models: [{ value: 'ollama/qwen3', label: 'Qwen 3', description: 'Ollama' }],
      fastMode: false,
      rewindScopes: ['conversation', 'both'],
    })
  })

  it('пресеты - те, что стоят кнопками под полем окна; у открытых моделей их нет (ADR 0096)', async () => {
    const { ide, codex, opencode, say, next } = threePanels()
    const strong: SetupPreset = {
      name: 'Strong',
      model: 'opus',
      effort: 'xhigh',
      mode: 'bypassPermissions',
    }
    const fast: SetupPreset = { name: 'Fast', model: null, effort: null, mode: 'acceptEdits' }
    const hidden: SetupPreset = { name: 'Plan', model: 'opus', effort: 'max', mode: 'plan' }
    const plain: SetupPreset = { name: 'Plain', model: 'gpt-5.5', effort: 'low', mode: 'readOnly' }

    ide.state.prefs = { ...ide.state.prefs, presetCount: 2, presets: [strong, fast, hidden] }
    codex.state.prefs = { ...codex.state.prefs, presetCount: 1, presets: [plain] }
    // Пресеты в записи открытых моделей (правка руками) кнопками не стоят и телефону не идут.
    opencode.state.prefs = { ...opencode.state.prefs, presetCount: 1, presets: [plain] }
    say({ k: 'hello' })

    const { providers } = await next('inventory')

    expect(providers.map((one) => one.presets)).toEqual([[strong, fast], [plain], []])
  })
})

describe('команды по id разговора - панели, у которой он есть', () => {
  it('сообщение, ответ, стоп, модель, усилие и режим разговора Codex - панели Codex', async () => {
    const { ide, codex, command, callsOf } = threePanels()

    codex.state.conversations = [codex.own({ pending: PERMISSION, status: 'waiting' })]

    const decision = { kind: 'permission', allow: true }

    for (const [name, args] of [
      ['conversation.send', { text: 'port it' }],
      ['conversation.respond', { requestId: PERMISSION.requestId, decision }],
      ['conversation.interrupt', {}],
      ['conversation.setModel', { model: 'gpt-5.5' }],
      ['conversation.setEffort', { effort: 'minimal' }],
      ['conversation.setMode', { mode: 'readOnly' }],
    ] as const) {
      expect(await command(name, { conversationId: CODEX, ...args })).toMatchObject({ ok: true })
    }

    expect(callsOf('codex.send')).toEqual([[CODEX, { text: 'port it', images: [] }]])
    expect(callsOf('codex.respond')[0]?.[1]).toBe(PERMISSION.requestId)
    expect(callsOf('codex.interrupt')).toEqual([[CODEX]])
    expect(callsOf('codex.setOptions')).toEqual([
      [CODEX, { model: 'gpt-5.5' }],
      [CODEX, { effort: 'minimal' }],
      [CODEX, { permissionMode: 'readOnly' }],
    ])
    // Панель Claude ничего не получила.
    expect(ide.calls.filter((call) => !call.name.startsWith('codex.'))).toEqual([])
  })

  it('чего провайдер не умеет, у окна нет - отказ, и до панели не доходит', async () => {
    const { command, callsOf } = threePanels()

    expect(
      await command('conversation.aside', { conversationId: CODEX, askId: 'a1', question: 'why?' }),
    ).toMatchObject(refusedFor('notSupported'))
    expect(
      await command('conversation.stopTask', { conversationId: CODEX, taskId: 't1' }),
    ).toMatchObject(refusedFor('notSupported'))
    expect(
      await command('conversation.setFast', { conversationId: OPENCODE, fast: true }),
    ).toMatchObject(refusedFor('notSupported'))
    // OpenCode откатывает код только вместе с разговором.
    const rewind = (scope: string) =>
      command('conversation.rewind', {
        conversationId: OPENCODE,
        messageId: '11111111-2222-4333-8444-555555555555',
        scope,
      })

    expect(await rewind('code')).toMatchObject(refusedFor('notSupported'))
    expect(await rewind('both')).toMatchObject({ ok: true })
    expect(callsOf('opencode.rewind').map(([, , scope]) => scope)).toEqual(['both'])
    expect(callsOf('codex.stopTask')).toEqual([])
  })

  it('режим и усилие не своего провайдера - отказ: auto у Codex, readOnly и ultra у Claude', async () => {
    const { command, callsOf } = threePanels()

    expect(
      await command('conversation.setMode', { conversationId: CODEX, mode: 'auto' }),
    ).toMatchObject(refusedFor('modeUnavailable'))
    expect(
      await command('conversation.setMode', { conversationId: CONVERSATION_ID, mode: 'readOnly' }),
    ).toMatchObject(refusedFor('modeUnavailable'))
    expect(
      await command('conversation.setEffort', { conversationId: CONVERSATION_ID, effort: 'ultra' }),
    ).toMatchObject(refusedFor('effortUnavailable'))
    expect(
      await command('conversation.setEffort', { conversationId: OPENCODE, effort: 'max' }),
    ).toMatchObject(refusedFor('effortUnavailable'))
    expect(callsOf('setOptions')).toEqual([])
    expect(callsOf('codex.setOptions')).toEqual([])
  })

  it('подписка на разговор Codex: его провайдер, его лента, вид действия без диффа', async () => {
    const { codex, say, next } = threePanels()

    codex.state.conversations = [codex.own({ pending: PERMISSION, status: 'waiting' })]
    say({ k: 'subscribe', conversationId: CODEX })

    const { conversation } = await next('conversation')
    const snapshot = await next('feed')

    expect(conversation).toMatchObject({ id: CODEX, provider: 'codex', unavailableModes: [] })
    expect(conversation.pending).toMatchObject({
      kind: 'permission',
      action: { kind: 'command', command: 'pnpm test', description: 'Run the test suite' },
    })
    expect(snapshot.conversationId).toBe(CODEX)
    expect(snapshot.items[0]).toMatchObject({
      name: 'apply_patch',
      action: { kind: 'edit', path: '{project}/src/app.ts' },
    })
    expect(snapshot.items[0]?.['action']).not.toHaveProperty('preview')
  })
})

describe('новый разговор и история - у провайдера, которого выбрал телефон', () => {
  it('новый разговор Codex - вкладкой его панели с выбором телефона', async () => {
    const { command, callsOf } = threePanels()

    expect(
      await command('conversation.new', {
        projectKey: PROJECT,
        provider: 'codex',
        model: 'gpt-5.5',
        effort: 'minimal',
        permissionMode: 'readOnly',
      }),
    ).toMatchObject({ ok: true, data: { conversationId: 'codex-new' } })
    expect(callsOf('codex.newConversation')).toEqual([
      [PROJECT_PATH, { model: 'gpt-5.5', effort: 'minimal', permissionMode: 'readOnly' }],
    ])
    expect(callsOf('newConversation')).toEqual([])
  })

  it('режим и усилие не этого провайдера, провайдер без панели - отказ до вкладки', async () => {
    const { command, callsOf } = threePanels()
    const newIn = (provider: string, over: object) =>
      command('conversation.new', { projectKey: PROJECT, provider, ...over })

    expect(await newIn('codex', { permissionMode: 'auto' })).toMatchObject(
      refusedFor('modeUnavailable'),
    )
    expect(await newIn('opencode', { effort: 'ultra' })).toMatchObject(
      refusedFor('effortUnavailable'),
    )
    expect(await newIn('gemini', {})).toMatchObject(refusedFor('providerMissing'))
    expect(callsOf('codex.newConversation')).toEqual([])
    expect(callsOf('opencode.newConversation')).toEqual([])
  })

  it('история и прошлый разговор - у панели провайдера', async () => {
    const { command, callsOf } = threePanels()

    expect(
      await command('conversation.history', { projectKey: PROJECT, provider: 'opencode' }),
    ).toMatchObject({
      ok: true,
      data: { entries: [{ sessionId: PANEL_PAST.opencode, title: 'Old work' }], more: false },
    })
    expect(
      await command('conversation.openHistory', {
        projectKey: PROJECT,
        provider: 'codex',
        sessionId: PANEL_PAST.codex,
      }),
    ).toMatchObject({ ok: true, data: { conversationId: 'codex-past' } })
    expect(callsOf('codex.openHistory')).toEqual([[PROJECT_PATH, PANEL_PAST.codex]])
    expect(callsOf('openHistory')).toEqual([])
  })
})

describe('провайдер только для чата (ADR 0094) - Antigravity с телефона', () => {
  /** Мост с Claude Code и Antigravity: его панель - только ядро AgentPanel, как у Codex. */
  const withAntigravity = () => {
    const setup = bridgeSetup()

    addPanel(setup.ide, 'antigravity')

    const callsOf = (name: string) =>
      setup.ide.calls.filter((call) => call.name === name).map((call) => call.args)

    return { ...setup, callsOf }
  }

  it('список машины говорит, кто только для чата: телефон гасит его в выборе прогона', async () => {
    const { say, next } = withAntigravity()

    say({ k: 'hello' })

    const { providers } = await next('inventory')

    expect(providers.map((one) => [one.id, one.chatOnly])).toEqual([
      ['claude', false],
      ['antigravity', true],
    ])
  })

  it('прогон и час с ним - отказ своим словом, до сервиса сценариев', async () => {
    const { command, callsOf } = withAntigravity()
    const shelf = { projectKey: PROJECT, scenarioId: 'tidy', scope: 'project' }

    expect(
      await command('scenarios.start', {
        ...shelf,
        inputs: {},
        provider: 'antigravity',
        target: { kind: 'new', worktree: true },
      }),
    ).toMatchObject(refusedFor('chatOnly'))
    expect(
      await command('scenarios.schedule', {
        ...shelf,
        scheduleId: '',
        at: 540,
        repeat: 'daily',
        weekday: 1,
        inputs: {},
        worktree: true,
        provider: 'antigravity',
      }),
    ).toMatchObject(refusedFor('chatOnly'))
    // Провайдера нет вовсе - по-прежнему «нет провайдера».
    expect(
      await command('scenarios.start', {
        ...shelf,
        inputs: {},
        provider: 'gemini',
        target: { kind: 'new', worktree: true },
      }),
    ).toMatchObject(refusedFor('providerMissing'))
    expect(callsOf('scenarios.start')).toEqual([])
    expect(callsOf('scenarios.schedule')).toEqual([])
  })

  it('свой разговор человека с телефона - можно: телефон - это человек', async () => {
    const { command, callsOf } = withAntigravity()

    expect(
      await command('conversation.new', { projectKey: PROJECT, provider: 'antigravity' }),
    ).toMatchObject({ ok: true, data: { conversationId: 'antigravity-new' } })
    expect(callsOf('antigravity.newConversation')).toHaveLength(1)
  })
})

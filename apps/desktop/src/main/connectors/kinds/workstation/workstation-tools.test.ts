import { it, vi, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import type { Scenario } from '@shared/scenarios'
import type { Task } from '@shared/tasks'
import type { WorkspaceState } from '@shared/workspace'

import type { SourceLaunch } from '../../connector-source'
import { WorkstationLink } from '../../../workstation/workstation-link'
import type { TasksPort, WorkstationPorts } from '../../../workstation/workstation-link'
import type { ScenariosPort, ConversationsPort } from '../../../remote/bridge/bridge-ports'
import {
  WORKSTATION_TOOLS,
  WORKSTATION_READ_TOOLS,
  createWorkstationSource,
} from './workstation-tools'

const WEB = '/work/web'
const API = '/work/api'

const WORKSPACE: WorkspaceState = {
  projects: [{ id: 'p1', name: 'web', rootPath: WEB }],
  activeProjectId: 'p1',
  recentProjects: [{ name: 'api', rootPath: API }],
}

/** Вызов через вход снаружи: процесса разговора нет, проекта - тоже. */
const OUTSIDE: SourceLaunch = { id: 'outside', projectPath: '', workDir: '', conversationId: null }

/** Процесс разговора вкладки web. */
const IN_WEB: SourceLaunch = { id: 'l1', projectPath: WEB, workDir: WEB, conversationId: 'me' }

const scenario = (inputs: Scenario['inputs'] = []): Scenario => ({
  version: 1,
  id: 'plan',
  name: 'Plan a card',
  createdAt: 1,
  updatedAt: 1,
  inputs,
  head: {
    briefing: '',
    provider: 'codex',
    model: '',
    effort: '',
    permissionMode: 'default',
    onQuestion: 'head',
    retries: 2,
    onGiveUp: 'stop',
  },
  stages: [],
  scope: 'project',
})

const conversation = (id: string, status: Conversation['status']): Conversation =>
  ({ id, projectPath: WEB, status, pending: null, queue: [] }) as unknown as Conversation

type Fakes = {
  scenarios: Partial<ScenariosPort>
  tasks?: Partial<TasksPort>
  conversations?: Conversation[]
  workspace?: WorkspaceState
  /** Проекты, где человек оставил коннектор; нет - все. */
  allowed?: (path: string) => boolean
}

/** IDE из подделок: только то, что зовёт тест; остальное упало бы. */
const ideOf = ({
  scenarios,
  tasks = {},
  conversations = [],
  workspace = WORKSPACE,
  allowed,
}: Fakes) => {
  const panel = {
    provider: 'claude',
    getState: () => ({ conversations }),
    send: vi.fn(() => Promise.resolve()),
    enqueue: vi.fn(() => Promise.resolve()),
    interrupt: vi.fn(),
    // Новая вкладка встаёт в панель свободной, как у настоящей панели.
    newConversation: vi.fn(() => {
      conversations.push(conversation('new-tab', 'idle'))

      return Promise.resolve('new-tab')
    }),
    openHistory: vi.fn(() => Promise.resolve(null)),
    info: () => ({ modes: ['default', 'acceptEdits', 'plan', 'bypassPermissions'] }),
  }
  const codex = {
    provider: 'codex',
    getState: () => ({ conversations: [] }),
    info: () => ({ modes: ['default', 'readOnly'] }),
  }
  const ports: WorkstationPorts = {
    projects: {
      state: () => workspace,
      open: vi.fn(() => Promise.resolve(workspace)),
    },
    scenarios: { queuesView: () => ({ queues: [], live: [] }), ...scenarios } as ScenariosPort,
    tasks: tasks as TasksPort,
    panels: () => [panel, codex] as unknown as ConversationsPort[],
  }
  const link = new WorkstationLink()

  link.ports = ports

  const source = createWorkstationSource(link, allowed)
  const call = async (name: string, args: Record<string, unknown>, launch?: SourceLaunch) => {
    const result = await source.callTool(name, args, undefined, launch)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''

    return {
      error: result.isError === true,
      text,
      json: result.isError ? null : (JSON.parse(text) as unknown),
    }
  }

  return { call, panel, ports }
}

describe('инструменты самой IDE', () => {
  it('имена короткие и свои, чтение - только инструменты на чтение', () => {
    const names = WORKSTATION_TOOLS.map((tool) => tool.name)

    expect(new Set(names).size).toBe(names.length)
    // Имя у CLI - mcp__workstation__<имя>, потолок Claude - 64 знака.
    expect(names.every((name) => /^[a-z_]+$/.test(name) && name.length + 17 <= 64)).toBe(true)
    expect(WORKSTATION_READ_TOOLS).toEqual(
      WORKSTATION_TOOLS.filter((tool) => tool.access === 'read').map((tool) => tool.name),
    )
    expect(WORKSTATION_READ_TOOLS).toContain('list_queues')
    expect(WORKSTATION_READ_TOOLS).not.toContain('start_scenario')
  })

  it('IDE ещё поднимается - просьба подождать, а не сбой', async () => {
    const source = createWorkstationSource(new WorkstationLink())
    const result = await source.callTool('list_projects', {}, undefined, IN_WEB)

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('starting or closing')
  })

  it('проекты: открытые, активный, недавние и проект разговора', async () => {
    const { call } = ideOf({ scenarios: {} })
    const { json } = await call('list_projects', {}, IN_WEB)

    expect(json).toEqual({
      projects: [
        { name: 'web', path: WEB, open: true, active: true },
        { name: 'api', path: API, open: false },
      ],
      thisProject: WEB,
    })
  })

  it('снаружи проект надо назвать; по имени он находится', async () => {
    const shelves = vi.fn(() =>
      Promise.resolve({
        scenarios: [],
        runs: [],
        schedules: [],
        schedulesUnread: false,
        canShare: true,
      }),
    )
    const { call } = ideOf({ scenarios: { shelves } })

    expect((await call('list_scenarios', {})).text).toContain('Name the project')
    expect((await call('list_scenarios', { project: 'nope' })).text).toContain('Known: web, api')
    await call('list_scenarios', { project: 'api' })
    expect(shelves).toHaveBeenCalledWith(API)
  })

  it('новая очередь с часами: часы - до первого шага, провайдер - сценария', async () => {
    const start = vi.fn(() => Promise.resolve({ ok: true as const, queueId: 'q1', itemId: 'i1' }))
    const { call } = ideOf({
      scenarios: { fetch: () => Promise.resolve(scenario()), start },
    })
    const answer = await call(
      'start_scenario',
      { scenario_id: 'plan', hours: { from: '09:00', to: '18:00', days: [4] } },
      IN_WEB,
    )

    expect(answer.json).toMatchObject({ queueId: 'q1', itemId: 'i1' })
    expect(start).toHaveBeenCalledWith({
      projectPath: WEB,
      scenarioId: 'plan',
      scope: 'project',
      inputs: {},
      provider: 'codex',
      target: { kind: 'new', worktree: false },
      hours: { from: 540, to: 1080, days: [4] },
    })
  })

  it('в существующую очередь - без часов; пустой обязательный ввод - отказ со словами', async () => {
    const start = vi.fn(() => Promise.resolve({ ok: true as const, queueId: 'q1', itemId: 'i2' }))
    const card = [{ id: 'u', name: 'url', label: 'Card', placeholder: '', required: true }]
    const { call } = ideOf({ scenarios: { fetch: () => Promise.resolve(scenario(card)), start } })

    expect((await call('start_scenario', { scenario_id: 'plan' }, IN_WEB)).text).toBe(
      'Answer the inputs: url.',
    )
    await call(
      'start_scenario',
      { scenario_id: 'plan', inputs: { url: 'https://x' }, queue_id: 'q1', provider: 'claude' },
      IN_WEB,
    )
    expect(start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { kind: 'queue', queueId: 'q1' },
        hours: null,
        provider: 'claude',
      }),
    )
  })

  it('правка очереди - те же действия, что у карточки; кривое время - отказ', async () => {
    const act = vi.fn(() => Promise.resolve(null))
    const { call } = ideOf({ scenarios: { act } })

    await call('update_queue', { queue_id: 'q1', action: 'stop_after', item_id: 'i3' })
    await call('update_queue', {
      queue_id: 'q1',
      action: 'set_hours',
      hours: { from: '22:00', to: '06:00', days: [1, 2, 3, 4, 5] },
    })
    expect(act).toHaveBeenNthCalledWith(1, 'q1', { kind: 'stopAfter', itemId: 'i3' })
    expect(act).toHaveBeenNthCalledWith(2, 'q1', {
      kind: 'hours',
      hours: { from: 1320, to: 360, days: [1, 2, 3, 4, 5] },
    })
    expect(
      (
        await call('update_queue', {
          queue_id: 'q1',
          action: 'set_hours',
          hours: { from: '25:00', to: '06:00', days: [1] },
        })
      ).text,
    ).toBe('"hours.from" is a time HH:MM')
  })

  it('вопрос прогона: словами ответит и откажет, а разрешение даёт только человек', async () => {
    const asking = (tool: string) => ({
      id: 'r1',
      state: 'blocked',
      question: { stepKey: 's', title: '', tool, detail: '', options: [], askedAt: 7 },
    })
    let question = asking('Bash')
    const answer = vi.fn(() => true)
    const { call } = ideOf({
      scenarios: { run: () => Promise.resolve(question as never), answer },
    })
    const say = (args: Record<string, unknown>) =>
      call('scenario_run_action', { run_id: 'r1', action: 'answer', ...args }, IN_WEB)

    expect((await say({ allow: true })).text).toContain('Only the person allows Bash')
    expect((await say({ allow: false, text: 'not now' })).json).toEqual({ answered: true })

    question = asking('AskUserQuestion')
    expect((await say({ text: 'the second one' })).json).toEqual({ answered: true })
    expect(answer).toHaveBeenCalledTimes(2)
    expect(answer).toHaveBeenLastCalledWith(WEB, 'r1', true, 'the second one', {
      stepKey: 's',
      askedAt: 7,
    })
  })

  it('сообщение: свободному - сразу, занятому - в очередь, себе - отказ', async () => {
    const { call, panel } = ideOf({
      scenarios: {},
      conversations: [
        conversation('me', 'running'),
        conversation('idle', 'idle'),
        conversation('busy', 'running'),
      ],
    })

    expect(
      (await call('send_message', { conversation_id: 'idle', text: 'go' }, IN_WEB)).json,
    ).toEqual({
      message: 'sent',
    })
    expect(
      (await call('send_message', { conversation_id: 'busy', text: 'later' }, IN_WEB)).json,
    ).toEqual({
      message: 'queued until its turn ends',
    })
    expect((await call('send_message', { conversation_id: 'me', text: 'x' }, IN_WEB)).error).toBe(
      true,
    )
    expect(panel.send).toHaveBeenCalledWith('idle', { text: 'go', images: [] })
    expect(panel.enqueue).toHaveBeenCalledWith('busy', { text: 'later', images: [] })
  })

  it('разговор - только в открытом проекте; новый с первым сообщением', async () => {
    const { call, panel } = ideOf({ scenarios: {} })

    expect((await call('open_conversation', { project: 'api' }, IN_WEB)).text).toContain(
      'is not open',
    )

    const opened = await call('open_conversation', { message: 'hello', effort: 'high' }, IN_WEB)

    expect(opened.json).toMatchObject({
      conversationId: 'new-tab',
      provider: 'claude',
      project: WEB,
    })
    expect(panel.newConversation).toHaveBeenCalledWith(WEB, { effort: 'high' })
    expect(panel.send).toHaveBeenCalledWith('new-tab', { text: 'hello', images: [] })
  })

  it('задание: новое - как форма окна в проекте разговора, правка - только названное', async () => {
    const stored = new Map<string, Task>()
    const save = vi.fn((draft: Task) => {
      const task = {
        ...draft,
        id: draft.id ?? 't1',
        createdAt: 1,
        updatedAt: 1,
        nextAt: 0,
        skipAt: 0,
      }

      stored.set(task.id, task)

      return Promise.resolve({ ok: true as const, state: null as never, taskId: task.id })
    })
    const { call } = ideOf({
      scenarios: {},
      tasks: { save: save, task: (id: string) => stored.get(id) },
    })

    await call('save_task', { name: 'Invoice', prompt: 'Make the invoice' }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: null,
        projectPath: WEB,
        schedule: { repeat: 'daily', at: 540, days: [1, 2, 3, 4, 5], monthDay: 1, date: '' },
        permissionMode: 'default',
      }),
    )

    await call(
      'save_task',
      { task_id: 't1', schedule: { repeat: 'monthly', month_day: 1, at: '10:30' } },
      IN_WEB,
    )
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 't1',
        name: 'Invoice',
        schedule: { repeat: 'monthly', at: 630, days: [1, 2, 3, 4, 5], monthDay: 1, date: '' },
      }),
    )
  })

  it('снаружи списки - по всем проектам, а «проект разговора» - пусто', async () => {
    const queue = (id: string, projectPath: string) => ({
      id,
      projectPath,
      items: [],
      workdir: { kind: 'project' },
    })
    const { call } = ideOf({
      scenarios: {
        queuesView: () => ({ queues: [queue('q1', WEB), queue('q2', API)], live: [] }) as never,
      },
    })
    const listed = (await call('list_queues', {}, OUTSIDE)).json as { queues: { id: string }[] }

    expect(listed.queues.map((one) => one.id)).toEqual(['q1', 'q2'])
    expect(((await call('list_queues', {}, IN_WEB)).json as typeof listed).queues).toHaveLength(1)
    expect((await call('list_projects', {}, OUTSIDE)).json).toMatchObject({ thisProject: null })
  })

  it('часы без дней и воскресенье нулём - отказ, а не вечный сон или понедельник', async () => {
    const start = vi.fn()
    const act = vi.fn()
    const schedule = vi.fn()
    const { call } = ideOf({
      scenarios: { fetch: () => Promise.resolve(scenario()), start, act, schedule },
    })
    const empty = { from: '09:00', to: '18:00', days: [] }

    expect(
      (await call('start_scenario', { scenario_id: 'plan', hours: empty }, IN_WEB)).error,
    ).toBe(true)
    expect(
      (await call('update_queue', { queue_id: 'q', action: 'set_hours', hours: empty })).error,
    ).toBe(true)
    expect(
      (
        await call(
          'schedule_scenario',
          { scenario_id: 'plan', at: '09:00', repeat: 'weekly', weekday: 0 },
          IN_WEB,
        )
      ).text,
    ).toBe('"weekday" is 1 Monday ... 7 Sunday')
    expect(start).not.toHaveBeenCalled()
    expect(act).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('сценарий без названной полки пишется на свою, а не уезжает в репозиторий', async () => {
    const save = vi.fn((_path: string, scenario: Scenario, scope: string) =>
      Promise.resolve({ ok: true as const, scenario: { ...scenario, scope } as Scenario }),
    )
    const fetch = vi.fn((_path: string, _id: string, scope: string) =>
      Promise.resolve(scope === 'user' ? scenario() : null),
    )
    const { call } = ideOf({ scenarios: { save: save, fetch: fetch } })

    await call('save_scenario', { scenario: { ...scenario(), scope: 'user' } }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(WEB, expect.anything(), 'user')

    const { scope: _scope, ...bare } = scenario()

    await call('save_scenario', { scenario: bare }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(WEB, expect.anything(), 'user')

    await call('save_scenario', { scenario: bare, scope: 'project' }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(WEB, expect.anything(), 'project')
  })

  it('правка задания: смена провайдера сбрасывает модель и чужой режим, пустой проект не переносит', async () => {
    const previous = {
      id: 't1',
      kind: 'schedule',
      name: 'Report',
      projectPath: API,
      prompt: 'Report',
      schedule: { repeat: 'daily', at: 540, days: [1], monthDay: 1, date: '' },
      enabled: true,
      catchUp: true,
      report: true,
      provider: 'codex',
      model: 'gpt-5.5',
      effort: 'high',
      permissionMode: 'readOnly',
      goal: { outbound: 'confirm', budgetUsd: 5, lifeDays: 7 },
      createdAt: 1,
      updatedAt: 1,
      nextAt: 0,
      skipAt: 0,
    } as Task
    const save = vi.fn(() =>
      Promise.resolve({ ok: true as const, state: null as never, taskId: 't1' }),
    )
    const { call } = ideOf({
      scenarios: {},
      tasks: { save, task: () => previous },
    })

    await call('save_task', { task_id: 't1', provider: 'claude', project: '' }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'claude',
        model: '',
        effort: '',
        permissionMode: 'default',
        projectPath: API,
      }),
    )

    await call('save_task', { task_id: 't1', model: '' }, IN_WEB)
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'codex', model: '', effort: 'high' }),
    )

    expect((await call('save_task', { task_id: 't1', permission_mode: 'auto' }, IN_WEB)).text).toBe(
      'codex has no permission mode auto.',
    )
    expect(
      (await call('save_task', { task_id: 't1', schedule: { days: [0, 6] } }, IN_WEB)).error,
    ).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('открыть проект по имени, которое носят два проекта, - отказ, а не первый попавшийся', async () => {
    const twins: WorkspaceState = {
      projects: [{ id: 'p1', name: 'web', rootPath: WEB }],
      activeProjectId: 'p1',
      recentProjects: [{ name: 'web', rootPath: '/old/web' }],
    }
    const { call, ports } = ideOf({ scenarios: {}, workspace: twins })

    expect((await call('open_project', { project: 'web' }, IN_WEB)).text).toBe(
      'Several projects are called web: give the folder path.',
    )
    expect(ports.projects.open).not.toHaveBeenCalled()
  })

  it('режим без вопросов агент не ставит ни заданию, ни сценарию; уже поставленный человеком - остаётся', async () => {
    const save = vi.fn(() =>
      Promise.resolve({ ok: true as const, state: null as never, taskId: 't1' }),
    )
    const mine = {
      id: 't1',
      name: 'Mine',
      prompt: 'Do it',
      projectPath: WEB,
      provider: 'claude',
      permissionMode: 'bypassPermissions',
      schedule: { repeat: 'daily', at: 540, days: [], monthDay: 1, date: '' },
    } as unknown as Task
    const { call } = ideOf({ scenarios: {}, tasks: { save, task: () => mine } })

    expect(
      (
        await call(
          'save_task',
          { name: 'x', prompt: 'y', permission_mode: 'bypassPermissions' },
          IN_WEB,
        )
      ).text,
    ).toContain('Only the person sets permission mode bypassPermissions')
    await call(
      'save_task',
      { task_id: 't1', name: 'Renamed', permission_mode: 'bypassPermissions' },
      IN_WEB,
    )
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Renamed', permissionMode: 'bypassPermissions' }),
    )

    const stored = scenario()
    const bypass = { ...stored, head: { ...stored.head, permissionMode: 'bypassPermissions' } }
    const saveScenario = vi.fn((_p: string, one: Scenario) =>
      Promise.resolve({ ok: true as const, scenario: one }),
    )
    let onShelf: Scenario | null = null
    const shelf = ideOf({
      scenarios: { save: saveScenario, fetch: () => Promise.resolve(onShelf) },
    })

    expect((await shelf.call('save_scenario', { scenario: bypass }, IN_WEB)).text).toContain(
      'Only the person sets permission mode bypassPermissions in a scenario',
    )
    onShelf = bypass
    expect(
      (await shelf.call('save_scenario', { scenario: { ...bypass, name: 'Edited' } }, IN_WEB))
        .error,
    ).toBe(false)
    expect(saveScenario).toHaveBeenCalledTimes(1)
  })

  it('коннектор сужен до проекта: чужие проекты, очереди и разговоры разговору не видны, снаружи - видны', async () => {
    const queue = (id: string, projectPath: string) => ({
      id,
      projectPath,
      items: [],
      workdir: { kind: 'project' },
    })
    const act = vi.fn(() => Promise.resolve(null))
    const away = { ...conversation('away', 'idle'), projectPath: API }
    const { call, panel } = ideOf({
      scenarios: {
        act,
        queuesView: () => ({ queues: [queue('q1', WEB), queue('q2', API)], live: [] }) as never,
      },
      conversations: [conversation('near', 'idle'), away],
      allowed: (path) => path === WEB,
    })

    expect(
      ((await call('list_projects', {}, IN_WEB)).json as { projects: unknown[] }).projects,
    ).toHaveLength(1)
    expect(
      (
        (await call('list_queues', { all_projects: true }, IN_WEB)).json as {
          queues: { id: string }[]
        }
      ).queues.map((one) => one.id),
    ).toEqual(['q1'])
    expect(
      (await call('update_queue', { queue_id: 'q2', action: 'clear_waiting' }, IN_WEB)).text,
    ).toContain('turned off for /work/api')
    expect(
      (await call('send_message', { conversation_id: 'away', text: 'hi' }, IN_WEB)).error,
    ).toBe(true)
    expect((await call('list_scenarios', { project: 'api' }, IN_WEB)).text).toContain(
      'No project api',
    )
    expect(act).not.toHaveBeenCalled()
    expect(panel.send).not.toHaveBeenCalled()

    expect(
      ((await call('list_queues', {}, OUTSIDE)).json as { queues: unknown[] }).queues,
    ).toHaveLength(2)
  })
})

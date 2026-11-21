import { it, vi, expect, describe, afterEach } from 'vitest'

import type {
  QueueItem,
  ScenarioQueue,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import type { Scenario } from '@shared/scenarios'
import type { WorkspaceState } from '@shared/workspace'

import type { SourceLaunch } from '../../connector-source'
import { TrackerRuns } from '../../../tracker/tracker-runs'
import { trackerKit } from '../../../tracker/tracker-test-kit'
import { WorkstationLink } from '../../../workstation/workstation-link'
import type { TasksPort, WorkstationPorts } from '../../../workstation/workstation-link'
import type { ScenariosPort } from '../../../remote/bridge/bridge-ports'
import { createWorkstationSource } from './workstation-tools'

const WEB = '/work/web'
const API = '/work/api'

const WORKSPACE: WorkspaceState = {
  projects: [{ id: 'p1', name: 'web', rootPath: WEB }],
  activeProjectId: 'p1',
  recentProjects: [{ name: 'api', rootPath: API }],
}

const IN_WEB: SourceLaunch = { id: 'l1', projectPath: WEB, workDir: WEB, conversationId: 'me' }
const IN_API: SourceLaunch = { id: 'l2', projectPath: API, workDir: API, conversationId: 'api' }
const OUTSIDE: SourceLaunch = { id: 'outside', projectPath: '', workDir: '', conversationId: null }

/** Сценарий, который можно запустить: одна стадия с карточкой. */
const scenario = (id: string, inputs: string[]): Scenario =>
  ({
    version: 1,
    id,
    name: id,
    scope: 'project',
    inputs: inputs.map((name, index) => ({
      id: `i${index}`,
      name,
      label: name,
      placeholder: '',
      required: false,
    })),
    head: { provider: 'claude', briefing: '', model: '', effort: '' },
    stages: [
      {
        id: 's1',
        title: 'Stage',
        repeat: 1,
        untilDone: false,
        cards: [{ id: 'c1', title: 'Card', prompt: 'go', slots: [], dod: '', after: '' }],
      },
    ],
  }) as unknown as Scenario

const kits: { service: { close: () => Promise<void> } }[] = []

afterEach(async () => {
  await Promise.all(kits.splice(0).map((kit) => kit.service.close()))
})

type Json = Record<string, unknown> & { id: string }

/**
 * IDE с настоящим трекером на временной книге и настоящей отправкой карточек; сценарии - в
 * памяти: очередь растёт от start, refuseAt - номер постановки, на которой очередь откажет.
 */
const ideOf = async (allowed?: (path: string) => boolean) => {
  const kit = await trackerKit()
  const shelf = [scenario('plan', ['card']), scenario('review', ['card', 'focus'])]
  const queues: ScenarioQueue[] = []
  const started: ScenarioStartRequest[] = []
  const refuse = { at: 0 }
  const fetch = (_path: string, id: string) =>
    Promise.resolve(shelf.find((one) => one.id === id) ?? null)
  const start = (request: ScenarioStartRequest): Promise<ScenarioStartOutcome> => {
    started.push(request)

    if (started.length === refuse.at) return Promise.resolve({ ok: false, code: 'queueBusy' })

    const item = { id: `item-${started.length}`, state: 'waiting' } as QueueItem
    const queue =
      request.target.kind === 'queue'
        ? queues.find((one) => one.id === (request.target as { queueId: string }).queueId)
        : undefined

    if (queue) queue.items.push(item)
    else queues.push({ id: `queue-${started.length}`, items: [item], closedAt: 0 } as ScenarioQueue)

    return Promise.resolve({
      ok: true,
      queueId: queue?.id ?? `queue-${started.length}`,
      itemId: item.id,
    })
  }
  const runs = new TrackerRuns(kit.service, {
    fetch,
    start,
    act: () => Promise.resolve(null),
    queues: () => queues,
  })
  const ports: WorkstationPorts = {
    projects: { state: () => WORKSPACE, open: vi.fn(() => Promise.resolve(WORKSPACE)) },
    scenarios: { fetch, queuesView: () => ({ queues, live: [] }) } as unknown as ScenariosPort,
    tasks: {} as TasksPort,
    tracker: {
      board: (place) => kit.service.board(place),
      apply: (place, op) => kit.service.apply(place, op),
      send: (place, request) => runs.send(place, request),
    },
    panels: () => [],
    extensions: () => null,
  }
  const link = new WorkstationLink()

  kits.push(kit)
  link.ports = ports

  const source = createWorkstationSource(link, allowed)
  const call = async (name: string, args: Record<string, unknown>, launch = IN_WEB) => {
    const result = await source.callTool(name, args, undefined, launch)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''

    return {
      error: result.isError === true,
      text,
      json: result.isError ? ({} as Json) : (JSON.parse(text) as Json),
    }
  }
  /** Проект трекера, поток и группа - инструментами, как сделала бы модель. */
  const columns = async (launch = IN_WEB, project?: string) => {
    const where = project ? { project } : {}
    const tab = (await call('tracker_save_project', { ...where, title: 'Release' }, launch)).json
    const flow = (
      await call(
        'tracker_save_flow',
        { ...where, tracker_project_id: tab.id, title: 'Backend', subtitle: 'API' },
        launch,
      )
    ).json
    const group = (
      await call('tracker_save_group', { ...where, flow_id: flow.id, title: 'Week 1' }, launch)
    ).json

    return { projectId: tab.id, flowId: flow.id, groupId: group.id }
  }
  const card = async (args: Record<string, unknown>) =>
    (await call('tracker_save_card', args)).json.id
  const tasks = async () => {
    const { json } = await call('tracker_board', {})
    const board = json as unknown as {
      tracker_projects: {
        flows: { groups: { tasks: { title: string; follow_ups?: { title: string }[] }[] }[] }[]
      }[]
    }

    return (board.tracker_projects[0]?.flows[0]?.groups[0]?.tasks ?? []).map((task) => [
      task.title,
      ...(task.follow_ups ?? []).map((one) => one.title),
    ])
  }

  return { call, columns, card, tasks, started, refuse }
}

describe('трекер в инструментах самой IDE', () => {
  it('доска коротко: id на каждом уровне, пустое не пишется, срок - как его принимают', async () => {
    const { call, columns, card } = await ideOf()
    const { projectId, flowId, groupId } = await columns()
    const a = await card({ group_id: groupId, title: 'A', due: '2026-11-21 9:30', priority: 1 })
    const a2 = await card({ follow_up_of: a, title: ' A2 ', done: true, description: 'Why' })

    expect((await call('tracker_board', {})).json).toEqual({
      project_path: WEB,
      tracker_projects: [
        {
          id: projectId,
          title: 'Release',
          flows: [
            {
              id: flowId,
              title: 'Backend',
              subtitle: 'API',
              groups: [
                {
                  id: groupId,
                  title: 'Week 1',
                  tasks: [
                    {
                      id: a,
                      title: 'A',
                      due: '2026-11-21 09:30',
                      priority: 1,
                      follow_ups: [
                        { id: a2, title: 'A2', description: 'Why', priority: 4, done: true },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
  })

  it('правка: только присланное, срок снимается пустым, место - только через tracker_move', async () => {
    const { call, columns, card } = await ideOf()
    const { groupId } = await columns()
    const a = await card({ group_id: groupId, title: 'A', subtitle: 'sub', due: '2026-11-21' })
    const saved = await call('tracker_save_card', { id: a, due: '', priority: 2 })

    expect(saved.json).toEqual({ id: a, title: 'A', subtitle: 'sub', priority: 2 })
    expect((await call('tracker_save_card', { id: a, group_id: groupId })).text).toBe(
      'group_id: to move it, use tracker_move.',
    )
    expect((await call('tracker_save_group', { id: groupId, title: 'Week 2' })).json).toMatchObject(
      {
        id: groupId,
        title: 'Week 2',
      },
    )
  })

  it('пачка из разговора: задачи с продолжениями по порядку, id в ответе', async () => {
    const { call, columns, tasks } = await ideOf()
    const { groupId } = await columns()
    const { json } = await call('tracker_add_cards', {
      group_id: groupId,
      cards: [
        { title: 'Spec', follow_ups: [{ title: 'Review spec' }, { title: 'Fix spec' }] },
        { title: 'Build', priority: 2 },
      ],
    })
    const created = json['created'] as { id: string; follow_ups?: string[] }[]

    expect(created).toHaveLength(2)
    expect(created[0]?.follow_ups).toHaveLength(2)
    expect(created[1]?.follow_ups).toBeUndefined()
    expect(await tasks()).toEqual([['Spec', 'Review spec', 'Fix spec'], ['Build']])
  })

  it('пачка с кривой карточкой отказывает до первой созданной и называет её', async () => {
    const { call, columns, tasks } = await ideOf()
    const { groupId } = await columns()
    const badDate = await call('tracker_add_cards', {
      group_id: groupId,
      cards: [{ title: 'Fine' }, { title: 'Bad', follow_ups: [{ title: 'x', due: '2026-02-30' }] }],
    })
    const nested = await call('tracker_add_cards', {
      group_id: groupId,
      cards: [{ title: 'A', follow_ups: [{ title: 'B', follow_ups: [{ title: 'C' }] }] }],
    })
    const blank = await call('tracker_add_cards', { group_id: groupId, cards: [{ title: '  ' }] })

    expect(badDate.text).toMatch(/^cards\[1\]\.follow_ups\[0\]: The due date is not a real date/)
    expect(nested.text).toContain('follow-ups do not nest')
    expect(blank.text).toBe('cards[0]: A title is required: one line, not empty.')
    expect(
      (await call('tracker_add_cards', { group_id: 'nope', cards: [{ title: 'A' }] })).text,
    ).toMatch(/^group_id: There is no such item/)
    expect(await tasks()).toEqual([])
  })

  it('перенос: порядок, в цепочку задачи, поток в другой проект; чужое место - отказ', async () => {
    const { call, columns, card, tasks } = await ideOf()
    const { groupId, flowId } = await columns()
    const a = await card({ group_id: groupId, title: 'A' })
    const b = await card({ group_id: groupId, title: 'B' })
    const c = await card({ group_id: groupId, title: 'C' })

    expect((await call('tracker_move', { kind: 'card', id: c, before_id: a })).json).toEqual({
      moved: c,
      order: [c, a, b],
    })
    await call('tracker_move', { kind: 'card', id: b, follow_up_of: a })
    expect(await tasks()).toEqual([['C'], ['A', 'B']])
    expect((await call('tracker_move', { kind: 'card', id: b, before_id: c })).text).toBe(
      `"before_id" ${c} is not there. In order: nothing yet.`,
    )
    expect((await call('tracker_move', { kind: 'flow', id: flowId, group_id: groupId })).text).toBe(
      'group_id: not a place for a flow.',
    )

    const other = (await call('tracker_save_project', { title: 'Other' })).json.id
    const moved = await call('tracker_move', {
      kind: 'flow',
      id: flowId,
      tracker_project_id: other,
    })

    expect(moved.json).toEqual({ moved: flowId, order: [flowId] })
  })

  it('удаление: проект - в архив с датой и назад, ветка - сразу со всем, что в ней', async () => {
    const { call, columns, card } = await ideOf()
    const { projectId, groupId } = await columns()
    const a = await card({ group_id: groupId, title: 'A' })
    const a2 = await card({ follow_up_of: a, title: 'A2' })

    expect((await call('tracker_delete', { kind: 'card', id: a })).json).toEqual({
      deleted: [a, a2],
    })

    const archived = await call('tracker_delete', { kind: 'project', id: projectId })
    const board = (await call('tracker_board', {})).json

    expect(archived.json['archived']).toBe(projectId)
    expect(archived.json['purge_at']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(board['tracker_projects']).toEqual([])
    expect(board['archived']).toEqual([
      expect.objectContaining({
        id: projectId,
        title: 'Release',
        purge_at: archived.json['purge_at'],
      }),
    ])
    expect((await call('tracker_save_group', { id: groupId, title: 'X' })).text).toContain(
      'archived: restore it first',
    )
    expect((await call('tracker_restore_project', { id: projectId })).json).toEqual({
      restored: projectId,
      title: 'Release',
    })
  })

  it('отказы словами: пустой заголовок, нет такого id, приоритет, проект снаружи', async () => {
    const { call, columns } = await ideOf()
    const { groupId } = await columns()

    expect((await call('tracker_save_project', { title: '   ' })).text).toBe(
      'A title is required: one line, not empty.',
    )
    expect((await call('tracker_save_card', { id: 'nope', title: 'x' })).text).toContain(
      'There is no such item of that kind on this board',
    )
    expect(
      (await call('tracker_save_card', { group_id: groupId, title: 'x', priority: 7 })).text,
    ).toBe('"priority" is 1 (most urgent), 2, 3 or 4 (none)')
    expect((await call('tracker_save_card', { title: 'x' })).text).toContain('group_id')
    expect((await call('tracker_board', {}, OUTSIDE)).text).toContain('Name the project')
  })

  it('сценарий карточки: есть на полке, поля его, отвязывается null', async () => {
    const { call, columns, card } = await ideOf()
    const { groupId } = await columns()
    const a = await card({ group_id: groupId, title: 'A' })
    const bind = (scenarioArg: unknown) =>
      call('tracker_save_card', { id: a, scenario: scenarioArg })

    expect((await bind({ scenario_id: 'ghost' })).text).toContain('There is no such scenario')
    expect((await bind({ scenario_id: 'review', inputs: { focuss: 'x' } })).text).toBe(
      'The scenario review has no input focuss. Its inputs: card, focus.',
    )
    expect((await bind({ scenario_id: 'plan', provider: 'antigravity' })).text).toContain(
      'antigravity works only in its own chat',
    )
    expect(
      (await bind({ scenario_id: 'review', inputs: { focus: '{{title}}' } })).json['scenario'],
    ).toEqual({
      scenario_id: 'review',
      scope: 'project',
      inputs: { focus: '{{title}}' },
    })
    expect((await bind(null)).json['scenario']).toBeUndefined()
  })

  it('группа в новую очередь с часами: по порядку доски, пропущенные - с причиной', async () => {
    const { call, columns, card, started } = await ideOf()
    const { groupId } = await columns()
    const plan = { scenario_id: 'plan' }
    const a = await card({ group_id: groupId, title: 'A', scenario: plan })
    const a2 = await card({ follow_up_of: a, title: 'A2', scenario: plan })
    const b = await card({ group_id: groupId, title: 'B' })
    const c = await card({ group_id: groupId, title: 'C', scenario: plan, done: true })
    const hours = { from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] }
    const sent = await call('tracker_send_to_queue', { group_id: groupId, hours })

    expect(sent.json).toEqual({
      queue_id: 'queue-1',
      sent: [a, a2],
      skipped: [
        { id: b, why: 'no scenario' },
        { id: c, why: 'done' },
      ],
    })
    expect(started.map((one) => [one.target, one.hours])).toEqual([
      [
        { kind: 'new', worktree: false },
        { from: 540, to: 1080, days: [1, 2, 3, 4, 5] },
      ],
      [{ kind: 'queue', queueId: 'queue-1' }, undefined],
    ])
    expect(started[0]?.inputs).toEqual({ card: 'A' })
    expect((await call('tracker_save_card', { id: a })).json['run']).toEqual({
      state: 'waiting',
      queue_id: 'queue-1',
      item_id: 'item-1',
    })
    expect((await call('tracker_send_to_queue', { group_id: groupId })).text).toContain(
      'Nothing to send',
    )
    expect((await call('tracker_send_to_queue', { card_id: b })).text).toBe(
      `Card ${b} "B": The card has no scenario: bind one first (tracker_save_card scenario). Nothing was sent.`,
    )
    expect((await call('tracker_send_to_queue', {})).text).toBe(
      'Give group_id or card_id - one of them.',
    )
  })

  it('очередь отказала посреди - словами карточка и что уже ушло', async () => {
    const { call, columns, card, refuse } = await ideOf()
    const { groupId } = await columns()
    const x = await card({ group_id: groupId, title: 'X', scenario: { scenario_id: 'plan' } })
    const y = await card({ group_id: groupId, title: 'Y', scenario: { scenario_id: 'plan' } })

    refuse.at = 2

    expect((await call('tracker_send_to_queue', { group_id: groupId })).text).toBe(
      `Card ${y} "Y": The queue is busy right now (a scenario runs or its worktree is being removed). Sent before it, they stay in queue queue-1: ${x}.`,
    )
  })

  it('сужение по проектам: чужая доска не видна ни по имени, ни по id, снаружи - видна', async () => {
    const { call, columns } = await ideOf((path) => path === WEB)
    const away = await columns(OUTSIDE, 'api')

    expect((await call('tracker_board', { project: 'api' })).text).toContain('No project api')
    expect((await call('tracker_board', {}, IN_API)).text).toContain('turned off for /work/api')
    expect((await call('tracker_save_project', { id: away.projectId, title: 'Mine' })).text).toBe(
      'That id is on the board of another project.',
    )
    expect((await call('tracker_send_to_queue', { group_id: away.groupId })).error).toBe(true)

    const outside = (await call('tracker_board', { project: 'api' }, OUTSIDE)).json

    expect(outside['project_path']).toBe(API)
    expect((outside['tracker_projects'] as Json[])[0]?.title).toBe('Release')
  })
})

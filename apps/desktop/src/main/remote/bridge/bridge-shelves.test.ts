import { it, expect, describe, afterEach } from 'vitest'

import type {
  DraftWire,
  ShelvesWire,
  StepLogWire,
  ScenarioWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'
import type { RunWire } from '@agentic-workstation/remote-protocol/wire-types'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { QUEUE, SCENARIO, RECENT_PATH, PROJECT_PATH } from '../__fixtures__/fake-ide'
import { projectKey } from './project-keys'

afterEach(stopBridges)

const key = projectKey(PROJECT_PATH)

const shelf = { projectKey: key, scenarioId: SCENARIO.id, scope: SCENARIO.scope }

const callsOf = (ide: ReturnType<typeof bridgeSetup>['ide'], name: string) =>
  ide.calls.filter((call) => call.name === name).map((call) => call.args)

describe('полки сценариев с телефона', () => {
  it('полки с историей прогонов и расписанием; ответы прогона с папками не уходят вовсе', async () => {
    const { command } = bridgeSetup()
    const wire = (
      (await command('scenarios.shelves', { projectKey: key })) as { data: ShelvesWire }
    ).data

    expect(JSON.stringify(wire)).not.toContain('/Users/')
    expect(wire.scenarios.map((scenario) => scenario.id)).toEqual(['tidy'])
    expect(wire.runs).toMatchObject([{ id: 'r-old', starred: true }])
    expect(wire.runs?.[0]).not.toHaveProperty('inputs')
    expect(wire).toMatchObject({ moreRuns: false, schedules: [], schedulesUnread: false })
  })

  it('сценарий целиком: бриф и промпт карточки - метками; чужой - notFound; закрытый проект - notOpen', async () => {
    const { command } = bridgeSetup()
    const fetched = await command('scenarios.fetch', shelf)
    const scenario = (fetched as { data: ScenarioWire }).data

    expect(scenario.head.briefing).toBe('Keep {project} tidy')
    expect(scenario.stages[0]?.cards[0]?.prompt).toBe('List what is in {project}/src')
    expect(await command('scenarios.fetch', { ...shelf, scenarioId: 'other' })).toMatchObject({
      ok: false,
      code: 'notFound',
    })
    expect(
      await command('scenarios.fetch', { ...shelf, projectKey: projectKey(RECENT_PATH) }),
    ).toMatchObject({ ok: false, code: 'notOpen' })
  })

  it('копия и удаление - на полке открытого проекта', async () => {
    const { ide, command } = bridgeSetup()

    await command('scenarios.duplicate', shelf)
    await command('scenarios.delete', shelf)

    expect(callsOf(ide, 'scenarios.duplicate')).toEqual([[PROJECT_PATH, 'tidy', 'project']])
    expect(callsOf(ide, 'scenarios.delete')).toEqual([[PROJECT_PATH, 'tidy', 'project']])
  })

  it('черновик ИИ: сохраняется ровно написанное моделью и один раз; ошибка - словами без папок', async () => {
    const { ide, command } = bridgeSetup()
    const drafted = await command('scenarios.draft', {
      projectKey: key,
      draftId: 'd1',
      description: 'Tidy the repo every night',
      scope: 'user',
    })

    expect((drafted as { data: DraftWire }).data).toMatchObject({
      ok: true,
      scenario: { id: 'drafted', name: 'Drafted', scope: 'user' },
    })
    expect(callsOf(ide, 'scenarios.draft')[0]?.[1]).toBe('remote:d1')
    expect(await command('scenarios.saveDraft', { projectKey: key, draftId: 'd1' })).toMatchObject({
      ok: true,
      data: { scenarioId: 'drafted', scope: 'user' },
    })
    expect(callsOf(ide, 'scenarios.save')[0]?.[2]).toBe('user')
    expect(await command('scenarios.saveDraft', { projectKey: key, draftId: 'd1' })).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'draftGone',
    })

    const failed = await command('scenarios.draft', {
      projectKey: key,
      draftId: 'd2',
      description: 'fail please',
      scope: 'project',
    })

    expect((failed as { data: DraftWire }).data).toEqual({
      ok: false,
      cancelled: false,
      error: 'CLI failed in {project}',
    })

    await command('scenarios.cancelDraft', { draftId: 'd3' })

    expect(callsOf(ide, 'scenarios.cancelDraft')).toEqual([['remote:d3']])

    // «Выбросить» написанное - тем же словом: сохранить его потом уже нечего.
    await command('scenarios.draft', {
      projectKey: key,
      draftId: 'd4',
      description: 'Another one',
      scope: 'project',
    })
    await command('scenarios.cancelDraft', { draftId: 'd4' })
    expect(await command('scenarios.saveDraft', { projectKey: key, draftId: 'd4' })).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'draftGone',
    })
  })

  it('расписание - часом формы When, без ключа проекта; снять - по id', async () => {
    const { ide, command } = bridgeSetup()

    await command('scenarios.schedule', {
      ...shelf,
      scheduleId: '',
      at: 9 * 60 + 30,
      repeat: 'weekly',
      weekday: 1,
      inputs: { what: 'src' },
      worktree: true,
      provider: 'claude',
    })
    await command('scenarios.unschedule', { projectKey: key, scheduleId: 'h1' })

    expect(callsOf(ide, 'scenarios.schedule')).toEqual([
      [
        PROJECT_PATH,
        {
          scenarioId: 'tidy',
          scope: 'project',
          scheduleId: '',
          at: 570,
          repeat: 'weekly',
          weekday: 1,
          inputs: { what: 'src' },
          worktree: true,
          provider: 'claude',
        },
      ],
    ])
    expect(callsOf(ide, 'scenarios.unschedule')).toEqual([[PROJECT_PATH, 'h1']])
  })
})

describe('прогоны с телефона', () => {
  it('очередь чистится от ждущих тем же действием очереди', async () => {
    const { ide, command } = bridgeSetup()

    await command('scenarios.queue', { queueId: QUEUE.id, action: { kind: 'clear' } })

    expect(callsOf(ide, 'scenarios.act')).toEqual([[QUEUE.id, { kind: 'clear' }]])
  })

  it('журнал шага: конец, потом страница выше - с подгрузкой транскрипта; нет журнала - found false', async () => {
    const { ide, command } = bridgeSetup()
    const tail = (
      (await command('scenarios.log', { projectKey: key, runId: 'r1', key: 'head' })) as {
        data: StepLogWire
      }
    ).data

    expect(tail.items.map((item) => item.id)).toEqual(['log-2', 'log-3', 'log-4'])
    expect(tail.hasEarlier).toBe(true)
    expect(JSON.stringify(tail)).not.toContain('/Users/')

    const above = (
      (await command('scenarios.log', {
        projectKey: key,
        runId: 'r1',
        key: 'head',
        before: 'log-2',
      })) as { data: StepLogWire }
    ).data

    expect(above.items.map((item) => item.id)).toEqual(['log-0', 'log-1'])
    expect(above.hasEarlier).toBe(false)
    expect(callsOf(ide, 'scenarios.log').map((args) => args[3])).toEqual([false, false, true])
    expect(
      await command('scenarios.log', { projectKey: key, runId: 'r1', key: 's1:c1:1' }),
    ).toMatchObject({ ok: true, data: { found: false, items: [] } })
  })

  it('звезда и удаление прогона из истории - в его проекте', async () => {
    const { ide, command } = bridgeSetup()

    await command('scenarios.starRun', { projectKey: key, runId: 'r-old', starred: false })
    await command('scenarios.deleteRun', { projectKey: key, runId: 'r-old' })

    expect(callsOf(ide, 'scenarios.starRun')).toEqual([[PROJECT_PATH, 'r-old', false]])
    expect(callsOf(ide, 'scenarios.deleteRun')).toEqual([[PROJECT_PATH, 'r-old']])
  })

  it('прогон из истории (не в очереди) открывается подпиской - IDE находит его на диске', async () => {
    const { say, next } = bridgeSetup()

    say({ k: 'subscribe', runId: 'r-old' })

    const { run } = (await next('run')) as { run: RunWire }

    expect(run).toMatchObject({ id: 'r-old', state: 'done' })
  })
})

import { it, expect, describe, afterEach } from 'vitest'

import type { ScenarioRun } from '@shared/scenario-runs'
import type { Scenario, ScenarioStage } from '@shared/scenarios'

import type { EngineHost } from './engine-core'
import { ScenarioEngine } from './scenario-engine'
import type { FakeScript } from './__fixtures__/fake-cli'
import { settle, FakeCli } from './__fixtures__/fake-cli'

const card = (id: string, prompt: string, slots: string[] = []) => ({
  id,
  title: `Card ${id}`,
  prompt,
  slots: slots.map((name) => ({ id: name, name, description: `the ${name}` })),
  dod: 'it says done',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
})

const stage = (
  id: string,
  cards: ReturnType<typeof card>[],
  extra: Partial<ScenarioStage> = {},
) => ({
  id,
  title: `Stage ${id}`,
  repeat: 1,
  untilDone: false,
  cards,
  ...extra,
})

const scenarioOf = (stages: ScenarioStage[], head: Partial<Scenario['head']> = {}): Scenario => ({
  version: 1,
  id: 'sc1',
  name: 'Review',
  createdAt: 1,
  updatedAt: 1,
  inputs: [{ id: 'i', name: 'branch', label: 'Branch', placeholder: '', required: true }],
  head: {
    briefing: 'Keep it tidy.',
    model: '',
    effort: '',
    permissionMode: 'acceptEdits',
    onQuestion: 'head',
    retries: 2,
    onGiveUp: 'stop',
    ...head,
  },
  stages,
  scope: 'project',
})

const runOf = (scenario: Scenario): ScenarioRun => ({
  id: 'run1',
  projectPath: '/project',
  cwd: '/project',
  provider: 'claude',
  queueId: 'q1',
  itemId: 'i1',
  scenarioId: scenario.id,
  scenarioName: scenario.name,
  scope: 'project',
  snapshot: scenario,
  startedAt: Date.now(),
  finishedAt: 0,
  state: 'starting',
  runFrom: '',
  inputs: { branch: 'feature/x' },
  total: 0,
  headConversationId: '',
  steps: [],
  notes: [],
  question: null,
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
  idle: 0,
  rested: 0,
  restingSince: 0,
  writtenAt: 0,
  starred: false,
  answering: false,
  limit: null,
  origin: 'ide',
})

/** Голова, которая всё одобряет: готова, слоты по описанию, карточка сделана. */
const agreeableHead: FakeScript = (said) => {
  if (said.includes('# The run you are the main thread of'))
    return { kind: 'say', text: 'Read it.\n```json\n{"ready": true}\n```' }
  if (said.includes('its list'))
    return {
      kind: 'say',
      text: 'Two of them. {"items": [{"label": "A", "value": "a.ts"}, "b.ts"]}',
    }
  if (said.includes('# Card'))
    return { kind: 'say', text: 'Handing it over. {"slots": {"findings": "notes.md"}}' }
  if (said.startsWith('The card’s turn'))
    return { kind: 'say', text: 'Done. {"done": true, "reason": "ok", "handoff": "x"}' }
  if (said.includes('is finished, and this stage runs again'))
    return { kind: 'say', text: '{"again": false}' }
  if (said.includes('stopped and is waiting'))
    return { kind: 'say', text: 'Fine. {"allow": true, "answer": ""}' }

  return { kind: 'say', text: 'Noted. {}' }
}

const workingCard: FakeScript = () => ({ kind: 'say', text: 'I did the work: wrote notes.md.' })

type Harness = {
  engine: ScenarioEngine
  runs: ScenarioRun[]
  ended: ScenarioRun[]
  fakes: FakeCli[]
  asked: string[]
}

const harness = (
  scenario: Scenario,
  head: FakeScript,
  cardScript: FakeScript,
  onDisk = true,
): Harness => {
  const fakes: FakeCli[] = []
  const runs: ScenarioRun[] = []
  const ended: ScenarioRun[] = []
  const asked: string[] = []
  let session = 0
  const host: EngineHost = {
    projectPath: '/tmp/project',
    spawn: (spec, wires) => {
      const fake = new FakeCli(
        spec,
        wires,
        spec.briefing.includes('main thread of a scenario') ? head : cardScript,
      )

      fakes.push(fake)

      return fake
    },
    onDisk: () => onDisk,
    transcriptPath: (id) => `/tmp/${id}.jsonl`,
    newSessionId: () => `00000000-0000-4000-8000-${String((session += 1)).padStart(12, '0')}`,
    defaults: () => ({ model: '', effort: '' }),
    accounts: {
      current: () => '',
      label: () => '',
      candidates: () => [
        { id: '', refusedUntil: null, fullest: null, twinOfHere: false, runs: null },
      ],
      same: (left, right) => left === right,
      noteRefused: () => undefined,
    },
    onChange: (run) => runs.push(run),
    onFinished: (run) => ended.push(run),
    notify: (body) => asked.push(body),
    noteConversation: () => undefined,
  }

  return { engine: new ScenarioEngine(runOf(scenario), '', host), runs, ended, fakes, asked }
}

let current: Harness | null = null

afterEach(() => {
  current?.engine.stop()
  current = null
})

describe('ScenarioEngine', () => {
  it('walks every card and ends done, the head’s words in the timeline', async () => {
    const scenario = scenarioOf([
      stage('s1', [
        card('a', 'Look at {{branch}}'),
        card('b', 'Write to [[findings]]', ['findings']),
      ]),
    ])

    current = harness(scenario, agreeableHead, workingCard)
    current.engine.begin()
    await settle(80)

    const [done] = current.ended

    expect(done?.state).toBe('done')
    expect(done?.steps.map((step) => step.state)).toEqual(['done', 'done'])
    expect(done?.steps[1]?.prompt).toBe('Write to notes.md')
    expect(done?.steps[0]?.prompt).toBe('Look at feature/x')
    expect(done?.notes.some((note) => note.text === 'Read it.')).toBe(true)
    expect(done?.cost).toBeGreaterThan(0)
    expect(done?.tokens).toBeGreaterThan(0)
  })

  it('stands on a question for a person and goes on once answered', async () => {
    const scenario = scenarioOf([stage('s1', [card('a', 'Run it')])], { onQuestion: 'stop' })
    const asking: FakeScript = () => ({
      kind: 'ask',
      tool: 'Bash',
      input: { command: 'rm -rf build' },
      then: 'Removed it.',
    })

    current = harness(scenario, agreeableHead, asking)
    current.engine.begin()
    await settle(60)

    expect(current.engine.run.state).toBe('blocked')
    expect(current.engine.run.question?.title).toBe('rm -rf build')
    expect(current.engine.run.question?.truncated).toBe(false)
    expect(current.asked).toHaveLength(1)

    current.engine.answer(true, '')
    await settle(60)

    expect(current.ended[0]?.state).toBe('done')
  })

  it('an answer from a stale screen does not land on the question standing now', async () => {
    const scenario = scenarioOf([stage('s1', [card('a', 'Run it')])], { onQuestion: 'stop' })
    const asking: FakeScript = () => ({
      kind: 'ask',
      tool: 'Bash',
      input: { command: `echo ${'x'.repeat(3000)}` },
      then: 'Done.',
    })

    current = harness(scenario, agreeableHead, asking)
    current.engine.begin()
    await settle(60)

    const question = current.engine.run.question

    // The detail is cut to DETAIL_CHARS: the flag says so, not a marker in the text.
    expect(question?.truncated).toBe(true)
    expect(current.engine.answer(true, '', { stepKey: 'other', askedAt: 1 })).toBe(false)
    expect(current.engine.run.state).toBe('blocked')

    const asked = { stepKey: question?.stepKey ?? '', askedAt: question?.askedAt ?? 0 }

    expect(current.engine.answer(true, '', asked)).toBe(true)
    // The same screen answering twice: the question is gone.
    expect(current.engine.answer(true, '', asked)).toBe(false)
    await settle(60)

    expect(current.ended[0]?.state).toBe('done')
  })

  it('sends a card back when the head asks for another go', async () => {
    let verdicts = 0
    const pickyHead: FakeScript = (said, spec) => {
      if (said.startsWith('The card’s turn')) {
        verdicts += 1

        return verdicts === 1
          ? { kind: 'say', text: '{"retry": "Add the tests."}' }
          : { kind: 'say', text: '{"done": true}' }
      }

      return agreeableHead(said, spec)
    }

    current = harness(scenarioOf([stage('s1', [card('a', 'Do it')])]), pickyHead, workingCard)
    current.engine.begin()
    await settle(80)

    expect(current.ended[0]?.state).toBe('done')
    expect(current.ended[0]?.steps[0]?.nudges).toEqual(['Add the tests.'])
  })

  it('writes a stage out as one pass per item of the head’s list', async () => {
    const listed = stage('s1', [card('a', 'Fix [[item]]')], {
      each: { name: 'item', description: 'the files' },
    })

    current = harness(scenarioOf([listed]), agreeableHead, workingCard)
    current.engine.begin()
    await settle(100)

    const steps = current.ended[0]?.steps ?? []

    expect(steps.map((step) => step.item?.value)).toEqual(['a.ts', 'b.ts'])
    expect(steps.map((step) => step.prompt)).toEqual(['Fix a.ts', 'Fix b.ts'])
    expect(current.ended[0]?.state).toBe('done')
  })

  it('ends the run when the head gives a card up', async () => {
    const strictHead: FakeScript = (said, spec) =>
      said.startsWith('The card’s turn')
        ? { kind: 'say', text: '{"done": false, "reason": "no tests"}' }
        : agreeableHead(said, spec)

    current = harness(
      scenarioOf([stage('s1', [card('a', 'Do it'), card('b', 'Then this')])]),
      strictHead,
      workingCard,
    )
    current.engine.begin()
    await settle(80)

    const [run] = current.ended

    expect(run?.state).toBe('failed')
    expect(run?.failure).toBe('undone')
    expect(run?.steps.map((step) => step.state)).toEqual(['failed', 'skipped'])
  })

  it('refuses the head anything that writes', async () => {
    const curiousHead: FakeScript = (said, spec) =>
      said.includes('# The run you are the main thread of')
        ? { kind: 'ask', tool: 'Write', input: { file_path: 'x' }, then: '{"ready": true}' }
        : agreeableHead(said, spec)

    current = harness(scenarioOf([stage('s1', [card('a', 'Do it')])]), curiousHead, workingCard)
    current.engine.begin()
    await settle(80)

    const head = current.fakes[0]

    expect(head?.answers[0]?.response['behavior']).toBe('deny')
    expect(current.ended[0]?.state).toBe('done')
  })

  it('stops, and picks the run up again from the card it was cut on', async () => {
    let hold = true
    const slowCard: FakeScript = () =>
      hold ? { kind: 'silent' } : { kind: 'say', text: 'Finished.' }

    current = harness(
      scenarioOf([stage('s1', [card('a', 'Do it'), card('b', 'Then')])]),
      agreeableHead,
      slowCard,
    )
    current.engine.begin()
    await settle(60)
    current.engine.stop()
    await settle(10)

    const stopped = current.ended[0]

    expect(stopped?.state).toBe('stopped')
    expect(stopped?.steps[0]?.state).toBe('failed')

    hold = false

    const again = harness(stopped?.snapshot ?? scenarioOf([]), agreeableHead, slowCard)
    const picked = new ScenarioEngine(stopped as ScenarioRun, '', {
      ...(again.engine as unknown as { e: { host: EngineHost } }).e.host,
    })

    current = { ...again, engine: picked }
    picked.carryOn()
    await settle(80)

    expect(again.ended[0]?.state).toBe('done')
    expect(again.ended[0]?.steps.map((step) => step.state)).toEqual(['done', 'done'])
  })
})

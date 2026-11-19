import { it, vi, expect, describe } from 'vitest'

import type { TitleSource } from '@shared/conversation'

import type { CliProcess } from '../cli/cli-process'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { ClaudeHost } from './claude-conversation'
import { attachClaude } from './claude-conversation'
import { TITLE_SAMPLE_CHARS } from './conversation.constants'
import { askTitle, forgetTitle, titleDescription } from './session-title'

/** Хост, которого хватает своему Claude разговора: лента без рассылки. */
const host = { onFeedPatch: vi.fn(), thumbnail: () => '' } as unknown as ClaudeHost

/**
 * Разговор ровно с тем, что трогает имя: ранг имени, а ожидание ответа и счёт /clear - у
 * своего Claude разговора (claude, тот же объект, что берёт claudeOf).
 */
const fakeRuntime = (titleSource: TitleSource) => {
  const runtime = {
    meta: { id: 'c1', title: 'Draft from the first message', titleSource },
    update: vi.fn((patch: object) => Object.assign(runtime.meta, patch)),
  }
  const claude = attachClaude(runtime as unknown as ConversationRuntime, host)

  return Object.assign(runtime, { claude })
}

/** Процесс, который отвечает на запрос имени тем, что ему дали. */
const fakeProcess = (reply: Promise<unknown>) => ({ control: vi.fn(() => reply) })

const ask = (
  runtime: ReturnType<typeof fakeRuntime>,
  process: ReturnType<typeof fakeProcess>,
  text: string,
) => askTitle(runtime as unknown as ConversationRuntime, process as unknown as CliProcess, text)

describe('titleDescription', () => {
  it('фраза уходит как есть, длинная - началом', () => {
    expect(titleDescription('  Make a Chrome extension game  ')).toBe(
      'Make a Chrome extension game',
    )
    expect(titleDescription('x'.repeat(TITLE_SAMPLE_CHARS + 50))).toHaveLength(TITLE_SAMPLE_CHARS)
  })

  it('короткое сообщение и служебная команда разговор не называют', () => {
    expect(titleDescription('ок')).toBeNull()
    expect(titleDescription('/compact')).toBeNull()
    expect(titleDescription('/model opus')).toBeNull()
  })

  it('команда работы без аргументов - словами, с аргументами - как написана', () => {
    expect(titleDescription('/cp')).toBe('the /cp command')
    expect(titleDescription('/fix REVIEW.md')).toBe('/fix REVIEW.md')
  })
})

describe('askTitle', () => {
  it('просит имя сразу и называет вкладку ответом модели', async () => {
    const runtime = fakeRuntime('heuristic')
    const process = fakeProcess(Promise.resolve({ title: 'Chrome tanks extension' }))

    ask(runtime, process, 'Make a Chrome extension game with tanks')

    expect(process.control).toHaveBeenCalledWith({
      subtype: 'generate_session_title',
      description: 'Make a Chrome extension game with tanks',
      persist: true,
    })
    await vi.waitFor(() => expect(runtime.meta.title).toBe('Chrome tanks extension'))
    expect(runtime.meta.titleSource).toBe('llm')
    expect(runtime.claude.titleAsking).toBe(false)
  })

  it('пока ответ в пути, второй раз не спрашивает; названную вкладку - больше никогда', async () => {
    const runtime = fakeRuntime('heuristic')
    const process = fakeProcess(Promise.resolve({ title: 'Named' }))

    ask(runtime, process, 'First long enough message')
    ask(runtime, process, 'Second long enough message')
    await vi.waitFor(() => expect(runtime.meta.titleSource).toBe('llm'))
    ask(runtime, process, 'Third long enough message')

    expect(process.control).toHaveBeenCalledTimes(1)
  })

  it('не вышло - следующее сообщение пробует снова', async () => {
    const runtime = fakeRuntime('heuristic')

    ask(runtime, fakeProcess(Promise.reject(new Error('aborted'))), 'First long enough message')
    await vi.waitFor(() => expect(runtime.claude.titleAsking).toBe(false))

    const retry = fakeProcess(Promise.resolve({ title: 'Named' }))

    ask(runtime, retry, 'Second long enough message')

    await vi.waitFor(() => expect(runtime.meta.title).toBe('Named'))
  })

  it('имя от человека, данное, пока модель думала, модель не перебивает', async () => {
    const runtime = fakeRuntime('heuristic')
    let answer: (value: unknown) => void = () => undefined
    const process = fakeProcess(new Promise((resolve) => (answer = resolve)))

    ask(runtime, process, 'Make a Chrome extension game')
    Object.assign(runtime.meta, { title: 'Tanks', titleSource: 'user' })
    answer({ title: 'Chrome tanks extension' })

    await vi.waitFor(() => expect(runtime.claude.titleAsking).toBe(false))
    expect(runtime.meta).toMatchObject({ title: 'Tanks', titleSource: 'user' })
  })

  it('ответ после /clear - о прежнем разговоре: не применяется, вкладка ждёт нового имени', async () => {
    const runtime = fakeRuntime('llm')

    forgetTitle(runtime as unknown as ConversationRuntime)

    expect(runtime.meta.titleSource).toBe('heuristic')

    let answer: (value: unknown) => void = () => undefined
    const process = fakeProcess(new Promise((resolve) => (answer = resolve)))

    ask(runtime, process, 'A new topic after clear')
    forgetTitle(runtime as unknown as ConversationRuntime)
    answer({ title: 'Stale name' })

    await vi.waitFor(() => expect(process.control).toHaveBeenCalled())
    await Promise.resolve()
    expect(runtime.meta.title).toBe('Draft from the first message')
  })
})

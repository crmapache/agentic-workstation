import { it, expect, describe } from 'vitest'

import type { AsideView } from '@shared/claude-panel'

import { CliReplyError } from '../cli/cli-process'
import type { ConversationRuntime } from '../conversation/conversation-runtime'
import { AsideDesk } from './aside-desk'

/** Процесс разговора: ответы на служебные запросы держит тест, отмена - ошибкой CLI. */
const fakeProcess = () => {
  const replies = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  const requests: Record<string, unknown>[] = []
  const process = {
    control: (request: Record<string, unknown>, id: string) =>
      new Promise((resolve, reject) => {
        requests.push(request)
        replies.set(id, { resolve, reject })
      }),
    cancelControl: (id: string) =>
      replies.get(id)?.reject(new CliReplyError('Side question cancelled')),
  }

  return { process, replies, requests }
}

const setup = (ready: Promise<unknown>) => {
  const views: AsideView[] = []
  let sleeps = 0
  const runtime = {
    meta: { id: 'c1' },
    isFree: true,
    isDisposed: false,
    process: null as unknown,
    prepareProcess: () => ready.then((process) => (runtime.process = process)),
    scheduleSleep: () => (sleeps += 1),
  }
  const desk = new AsideDesk(() => runtime as unknown as ConversationRuntime)

  desk.onChange = (view) => views.push(view)

  return { desk, views, sleeps: () => sleeps }
}

/** Последний вопрос цепочки вкладки. */
const lastAsk = (desk: AsideDesk) => desk.thread('c1').exchanges.at(-1)

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('вопрос сбоку', () => {
  it('прошлые ответы - в запрос, повтор и ответ - в цепочку, процесс снова спит', async () => {
    const { process, replies, requests } = fakeProcess()
    const { desk, sleeps } = setup(Promise.resolve(process))

    desk.ask('c1', 'q0', null)
    await flush()
    replies.get(lastAsk(desk)?.id ?? '')?.resolve({ response: 'a0' })
    await flush()

    desk.ask('c1', ' why? ', null)
    await flush()

    const id = lastAsk(desk)?.id ?? ''

    expect(requests[1]).toMatchObject({
      subtype: 'side_question',
      question: 'why?',
      history: [{ question: 'q0', response: 'a0' }],
    })
    expect(
      desk.progress({
        type: 'system',
        subtype: 'control_request_progress',
        request_id: id,
        status: 'api_retry',
        attempt: 2,
      }),
    ).toBe(true)
    expect(lastAsk(desk)?.retry).toMatchObject({ attempt: 2 })

    replies.get(id)?.resolve({ response: 'because' })
    await flush()

    expect(lastAsk(desk)).toMatchObject({ state: 'answered', text: 'because', retry: null })
    expect(sleeps()).toBe(2)
  })

  it('отмена до того, как процесс поднялся: конец сразу, вопрос не уходит вовсе', async () => {
    const { process, requests } = fakeProcess()
    let raise: (value: unknown) => void = () => undefined
    const { desk } = setup(new Promise((resolve) => (raise = resolve)))

    desk.ask('c1', 'hi', null)
    desk.cancel('c1', lastAsk(desk)?.id ?? '')
    raise(process)
    await flush()

    expect(lastAsk(desk)?.state).toBe('cancelled')
    expect(requests).toEqual([])
  })

  it('отмена в пути - ошибкой CLI, один конец; чужой разговор отменить не может', async () => {
    const { process } = fakeProcess()
    const { desk, views } = setup(Promise.resolve(process))

    desk.ask('c1', 'hi', null)

    const id = lastAsk(desk)?.id ?? ''

    await flush()
    desk.cancel('c2', id)
    await flush()
    expect(lastAsk(desk)?.state).toBe('asking')

    const seen = views.length

    desk.cancel('c1', id)
    desk.cancel('c1', id)
    await flush()

    expect(lastAsk(desk)?.state).toBe('cancelled')
    expect(views.filter((view) => view.conversationId === 'c1')).toHaveLength(seen + 1)
  })

  it('вопрос с телефона: свой id, итог - тому, кто ждёт, карточка на столе не открывается', async () => {
    const { process, replies, requests } = fakeProcess()
    const { desk } = setup(Promise.resolve(process))
    const answer = desk.askFor('c1', ' what now? ', 'phone-1')

    await flush()

    expect(desk.thread('c1').open).toBe(false)
    expect(lastAsk(desk)).toMatchObject({ id: 'phone-1', question: 'what now?', state: 'asking' })
    expect(requests).toHaveLength(1)
    // Тот же id второй раз - не второй вопрос.
    expect(await desk.askFor('c1', 'again', 'phone-1')).toBeNull()

    replies.get('phone-1')?.resolve({ response: 'Writing the tests.' })

    expect(await answer).toMatchObject({
      id: 'phone-1',
      state: 'answered',
      text: 'Writing the tests.',
    })
  })

  it('отмена вопроса с телефона кончает его ожидание отменой', async () => {
    const { process } = fakeProcess()
    const { desk } = setup(Promise.resolve(process))
    const answer = desk.askFor('c1', 'q', 'phone-2')

    await flush()
    desk.cancel('c1', 'phone-2')

    expect(await answer).toMatchObject({ id: 'phone-2', state: 'cancelled' })
  })
})

import { it, expect, describe } from 'vitest'

import type { AsideThread, AsideExchange } from '@shared/panel-extras'

import {
  answerOf,
  failureOf,
  withAsked,
  withRetry,
  progressOf,
  withEnding,
  sideHistory,
  sideRequest,
} from './side-question'

const exchange = (id: string, change: Partial<AsideExchange> = {}): AsideExchange => ({
  id,
  question: `q-${id}`,
  askedAt: 0,
  state: 'answered',
  text: `a-${id}`,
  notice: '',
  failure: null,
  message: '',
  retry: null,
  ...change,
})

const thread = (exchanges: AsideExchange[]): AsideThread => ({ open: true, exchanges })

describe('вопрос сбоку: формы CLI', () => {
  // Тело ответа - как его прислал 2.1.280 на вопрос в свободном разговоре (замер ACC).
  it('ответ модели - ответ', () => {
    expect(answerOf({ response: 'PELICAN', synthetic: false })).toEqual({
      state: 'answered',
      text: 'PELICAN',
      notice: '',
    })
  })

  it('заглушка CLI - не ответ, но её слова остаются', () => {
    const text = '(No answer available for this side question. Try again.)'

    expect(answerOf({ response: text, synthetic: true })).toEqual({ state: 'empty', text })
    expect(answerOf({ response: null })).toEqual({ state: 'empty', text: '' })
    expect(answerOf(null)).toEqual({ state: 'empty', text: '' })
  })

  it('отказавшаяся модель оставляет пометку рядом с ответом', () => {
    const reply = {
      response: 'Yes.',
      synthetic: false,
      refusal_fallback: { original_model: 'a', fallback_model: 'b', content: 'Answered by b' },
    }

    expect(answerOf(reply)).toEqual({ state: 'answered', text: 'Yes.', notice: 'Answered by b' })
  })

  it('отмена и отказ различаются словами CLI', () => {
    expect(failureOf('Side question cancelled')).toEqual({ state: 'cancelled' })
    expect(failureOf('Session is shutting down')).toEqual({
      state: 'failed',
      failure: 'refused',
      message: 'Session is shutting down',
    })
  })

  it('прогресс читается со строки CLI, повтор - со счётчиками', () => {
    const started = {
      type: 'system',
      subtype: 'control_request_progress',
      request_id: 'r-1',
      status: 'started',
    }
    const retry = {
      ...started,
      status: 'api_retry',
      attempt: 2,
      max_retries: 10,
      retry_delay_ms: 8000,
      error_status: 529,
    }

    expect(progressOf(started, 100)).toEqual({ requestId: 'r-1', retry: null })
    expect(progressOf(retry, 100)).toEqual({
      requestId: 'r-1',
      retry: { attempt: 2, maxRetries: 10, retryAt: 8100 },
    })
    expect(progressOf({ type: 'system', subtype: 'init' }, 0)).toBeNull()
  })

  it('слово в тексте агента - не прогресс', () => {
    const line = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: '"subtype":"control_request_progress"' }] },
    }

    expect(progressOf(line, 0)).toBeNull()
  })

  it('запрос несёт вопрос и цепочку словами CLI', () => {
    const request = sideRequest('and why?', [exchange('1', { notice: 'n' })])

    expect(request).toEqual({
      subtype: 'side_question',
      question: 'and why?',
      history: [{ question: 'q-1', response: 'a-1', fallback_notice: 'n' }],
    })
  })
})

describe('вопрос сбоку: цепочка вкладки', () => {
  it('в историю идут только настоящие ответы модели, без того, что задают заново', () => {
    const chain = thread([
      exchange('1'),
      exchange('2', { state: 'empty' }),
      exchange('3', { state: 'failed', text: '' }),
      exchange('4'),
    ])

    expect(sideHistory(chain, null).map((item) => item.id)).toEqual(['1', '4'])
    expect(sideHistory(chain, '4').map((item) => item.id)).toEqual(['1'])
  })

  it('десять последних ответов, не больше', () => {
    const chain = thread(Array.from({ length: 14 }, (_, index) => exchange(String(index))))

    expect(sideHistory(chain, null)).toHaveLength(10)
    expect(sideHistory(chain, null)[0]?.id).toBe('4')
  })

  it('спросить снова - на месте неудачного, новый вопрос - в конец, карточка открыта', () => {
    const chain = { open: false, exchanges: [exchange('1', { state: 'failed' }), exchange('2')] }
    const asked = exchange('3', { state: 'asking', text: '' })

    expect(withAsked(chain, asked, '1').exchanges.map((item) => item.id)).toEqual(['3', '2'])
    expect(withAsked(chain, asked, null).exchanges.map((item) => item.id)).toEqual(['1', '2', '3'])
    expect(withAsked(chain, asked, null).open).toBe(true)
  })

  it('цепочка держит двадцать последних, ждущий ответа не выбрасывается', () => {
    const waiting = exchange('w', { state: 'asking' })
    const many = [waiting, ...Array.from({ length: 20 }, (_, index) => exchange(String(index)))]
    const next = withAsked(thread(many), exchange('new', { state: 'asking' }), null)

    expect(next.exchanges).toHaveLength(20)
    expect(next.exchanges[0]?.id).toBe('w')
    expect(next.exchanges.at(-1)?.id).toBe('new')
  })

  it('конец ложится только на ждущий вопрос и снимает повтор', () => {
    const asking = withRetry(thread([exchange('1', { state: 'asking', text: '' })]), '1', {
      attempt: 1,
      maxRetries: 10,
      retryAt: 5,
    })
    const answered = withEnding(asking, '1', { state: 'answered', text: 'yes', notice: '' })

    expect(asking.exchanges[0]?.retry?.attempt).toBe(1)
    expect(answered.exchanges[0]).toMatchObject({ state: 'answered', text: 'yes', retry: null })
    // Второй ответ на тот же id ничего не перетирает.
    expect(withEnding(answered, '1', { state: 'cancelled' }).exchanges[0]?.state).toBe('answered')
  })

  it('ответ под закрытую карточку её не открывает', () => {
    const closed = { open: false, exchanges: [exchange('1', { state: 'asking' })] }

    expect(withEnding(closed, '1', { state: 'empty', text: '' }).open).toBe(false)
  })
})

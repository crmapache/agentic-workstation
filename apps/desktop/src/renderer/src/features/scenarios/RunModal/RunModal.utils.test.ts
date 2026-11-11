import { it, expect, describe } from 'vitest'

import { openingOf, roadMoodOf, runDescription } from './RunModal.utils'

describe('openingOf', () => {
  const going = { state: 'running' as const, error: '', question: null, limit: null }

  it('идущий прогон - у настоящего', () => {
    expect(openingOf(going)).toBe('present')
  })

  it('наверх - когда наверху то, что читать первым', () => {
    const question = {
      stepKey: 's:c:1',
      title: 'Into the report?',
      tool: 'AskUserQuestion',
      detail: '',
      options: ['Yes', 'No'],
      askedAt: 1,
    }

    expect(openingOf({ ...going, state: 'done' })).toBe('top')
    expect(openingOf({ ...going, error: 'boom' })).toBe('top')
    expect(openingOf({ ...going, state: 'blocked', question })).toBe('top')
    expect(
      openingOf({
        ...going,
        state: 'paused',
        limit: { account: '', window: 'five_hour', until: 1, reason: 'limit' },
      }),
    ).toBe('top')
  })
})

describe('roadMoodOf', () => {
  it('вопрос - ждёт человека, конец - настоящего нет', () => {
    expect(roadMoodOf('running')).toBe('working')
    expect(roadMoodOf('starting')).toBe('working')
    expect(roadMoodOf('blocked')).toBe('asking')
    expect(roadMoodOf('paused')).toBe('paused')
    expect(roadMoodOf('stopped')).toBe('over')
    expect(roadMoodOf('done')).toBe('over')
  })
})

describe('runDescription', () => {
  it('очередь и первый ответ - что есть', () => {
    expect(runDescription('Night fixes', { ticket: 'ABC-12', note: '' })).toBe(
      'Night fixes · ABC-12',
    )
    expect(runDescription('', { ticket: 'ABC-12' })).toBe('ABC-12')
    expect(runDescription('Night fixes', {})).toBe('Night fixes')
  })
})

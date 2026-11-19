import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'

import { dotState, isWorking, worksOnItsOwn } from './StatusDot.utils'

type Source = Parameters<typeof dotState>[0]

const tab = (change: Partial<Source> = {}): Source => ({
  status: 'idle',
  outcome: 'none',
  pending: null,
  turnStartedAt: null,
  backgroundWork: false,
  ...change,
})

// Точке важен только вид вопроса: остальные поля разрешения ей не нужны.
const permission = { kind: 'permission' } as Conversation['pending']

describe('точка состояния вкладки', () => {
  it('пустая - idle, после хода - done', () => {
    expect(dotState(tab(), true)).toBe('idle')
    expect(dotState(tab({ outcome: 'done' }), true)).toBe('done')
  })

  it('работает - и когда ход кончился, а фоновые субагенты ещё нет', () => {
    expect(dotState(tab({ status: 'running', turnStartedAt: 1 }), false)).toBe('running')
    expect(dotState(tab({ outcome: 'done', backgroundWork: true }), false)).toBe('running')
    expect(isWorking(tab({ backgroundWork: true }))).toBe(true)
  })

  it('разрешение зовёт всегда, вопрос - пока идёт ход', () => {
    expect(dotState(tab({ status: 'waiting', pending: permission }), true)).toBe('attention')
    expect(dotState(tab({ status: 'waiting', turnStartedAt: 1 }), true)).toBe('attention')
    expect(dotState(tab({ status: 'waiting', turnStartedAt: null }), true)).toBe('running')
  })

  it('ошибка зовёт только из фоновой вкладки, поломка - всегда и первой', () => {
    expect(dotState(tab({ outcome: 'error' }), false)).toBe('attention')
    expect(dotState(tab({ outcome: 'error' }), true)).toBe('done')
    expect(dotState(tab({ outcome: 'crashed', pending: permission }), true)).toBe('crashed')
  })
})

describe('работает сам - знак работы на вкладке проекта', () => {
  it('идёт ход или фоновые субагенты - да', () => {
    expect(worksOnItsOwn(tab({ status: 'running', turnStartedAt: 1 }))).toBe(true)
    expect(worksOnItsOwn(tab({ outcome: 'done', backgroundWork: true }))).toBe(true)
  })

  it('ждёт человека, сломался или стоит - нет, и ошибка фоновой вкладки этого не меняет', () => {
    expect(worksOnItsOwn(tab({ status: 'running', pending: permission }))).toBe(false)
    expect(worksOnItsOwn(tab({ status: 'waiting', turnStartedAt: 1 }))).toBe(false)
    expect(worksOnItsOwn(tab({ status: 'running', outcome: 'crashed' }))).toBe(false)
    expect(worksOnItsOwn(tab({ outcome: 'done' }))).toBe(false)
    expect(worksOnItsOwn(tab({ status: 'running', outcome: 'error', turnStartedAt: 1 }))).toBe(true)
  })
})

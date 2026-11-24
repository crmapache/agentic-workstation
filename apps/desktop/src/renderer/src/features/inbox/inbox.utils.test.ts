import { it, expect, describe } from 'vitest'

import type { Question } from '@shared/conversation'
import type { InboxItem } from '@shared/inbox'

import { TOAST_HIDE_MS } from './inbox.constants'
import {
  itemsOf,
  answersOf,
  previewOf,
  togglePick,
  toastCloseMs,
  answersAtOnce,
} from './inbox.utils'

const item = (patch: Partial<InboxItem>): InboxItem => ({
  id: 'i',
  kind: 'message',
  tone: 'info',
  title: 'Title',
  body: '',
  source: '',
  projectPath: '',
  origin: { kind: 'none' },
  actions: [],
  questions: [],
  tool: '',
  detail: '',
  reason: '',
  requestId: '',
  createdAt: 1,
  deliverAt: 1,
  arrivedAt: 1,
  readAt: 0,
  doneAt: 0,
  outcome: '',
  ...patch,
})

const question = (text: string, multiSelect = false): Question => ({
  question: text,
  header: '',
  options: [],
  multiSelect,
})

describe('itemsOf', () => {
  it('splits shown, scheduled and closed notifications', () => {
    const state = {
      items: [
        item({ id: 'open' }),
        item({ id: 'later', arrivedAt: 0, deliverAt: 30 }),
        item({ id: 'soon', arrivedAt: 0, deliverAt: 20 }),
        item({ id: 'done', doneAt: 5 }),
      ],
    }

    expect(itemsOf(state, 'open').map((one) => one.id)).toEqual(['open'])
    expect(itemsOf(state, 'scheduled').map((one) => one.id)).toEqual(['soon', 'later'])
    expect(itemsOf(state, 'done').map((one) => one.id)).toEqual(['done'])
  })
})

describe('answersOf', () => {
  it('prefers own words and joins picked options', () => {
    const questions = [question('Send?'), question('Which?', true)]

    expect(answersOf(questions, { 'Send?': ['Yes'], 'Which?': ['A', 'B'] }, {})).toEqual({
      'Send?': 'Yes',
      'Which?': 'A, B',
    })
    expect(answersOf(questions, { 'Which?': ['A'] }, { 'Send?': ' Later ' })).toEqual({
      'Send?': 'Later',
      'Which?': 'A',
    })
    expect(answersOf(questions, { 'Send?': ['Yes'] }, {})).toBeNull()
  })

  it('toggles picks only for multi-select questions', () => {
    expect(togglePick(['A'], 'B', false)).toEqual(['B'])
    expect(togglePick(['A'], 'B', true)).toEqual(['A', 'B'])
    expect(togglePick(['A', 'B'], 'A', true)).toEqual(['B'])
    expect(answersAtOnce([question('One?')])).toBe(true)
    expect(answersAtOnce([question('One?', true)])).toBe(false)
  })
})

describe('previewOf', () => {
  it('says the gist in one plain line', () => {
    expect(previewOf(item({ kind: 'permission', tool: 'Bash', detail: 'ls -la' }))).toBe(
      'Bash: ls -la',
    )
    expect(previewOf(item({ body: '**Invoice** #12\nready' }))).toBe('Invoice #12 ready')
  })
})

describe('уходит ли карточка из угла сама', () => {
  it('отчёт и сообщение уходят: всё есть на виде уведомлений', () => {
    expect(toastCloseMs(item({ kind: 'message' }))).toBe(TOAST_HIDE_MS)
    expect(toastCloseMs(item({ kind: 'report' }))).toBe(TOAST_HIDE_MS)
  })

  it('вопрос без ответа, «нужно внимание» и напоминание стоят, пока их не закроют', () => {
    expect(toastCloseMs(item({ kind: 'question' }))).toBeUndefined()
    expect(toastCloseMs(item({ kind: 'message', tone: 'attention' }))).toBeUndefined()
    expect(toastCloseMs(item({ kind: 'reminder', tone: 'info' }))).toBeUndefined()
  })
})

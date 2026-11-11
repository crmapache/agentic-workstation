import { it, expect, describe } from 'vitest'

import { allAnswered, questionAnswers, permissionDetail } from './PendingCard.utils'

const questions = [
  { question: 'Which?', header: 'Pick', options: [], multiSelect: false },
  { question: 'What else?', header: 'More', options: [], multiSelect: true },
]

describe('ответы на вопрос хода', () => {
  it('по тексту вопроса - выбранное через запятую, свой текст важнее выбора', () => {
    const answers = questionAnswers(questions, { 0: ['A'], 1: ['X', 'Y'] }, { 0: '  my own  ' })

    expect(answers).toEqual({ 'Which?': 'my own', 'What else?': 'X, Y' })
    expect(allAnswered(answers)).toBe(true)
  })

  it('без ответа на любой вопрос - отправить нельзя', () => {
    expect(allAnswered(questionAnswers(questions, { 0: ['A'] }, {}))).toBe(false)
  })

  it('разрешение: команда как есть, остальное JSON', () => {
    const base = {
      kind: 'permission' as const,
      requestId: 'r',
      toolName: 'Bash',
      description: '',
      reason: '',
    }

    expect(permissionDetail({ ...base, input: { command: 'pnpm test' } })).toBe('pnpm test')
    expect(permissionDetail({ ...base, input: { url: 'x' } })).toBe('{\n  "url": "x"\n}')
  })
})

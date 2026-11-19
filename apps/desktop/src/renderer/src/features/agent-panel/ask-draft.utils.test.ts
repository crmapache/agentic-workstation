import { it, expect, describe } from 'vitest'

import {
  answerFor,
  togglePick,
  askAnswered,
  openOwnAnswer,
  EMPTY_ASK_DRAFT,
  firstUnanswered,
  pasteIntoOwnAnswer,
} from './ask-draft.utils'

describe('ответы на вопрос', () => {
  const single = { question: 'Which?', header: '', multiSelect: false, options: [] }
  const multi = { ...single, question: 'Many?', multiSelect: true }

  it('одиночный выбор заменяет и закрывает свой ответ, множественный - галочки', () => {
    const own = openOwnAnswer(EMPTY_ASK_DRAFT, single, 0)
    const picked = togglePick(own, single, 0, 'A')

    expect(picked.custom[0]).toBeUndefined()
    expect(
      answerFor(togglePick(togglePick(EMPTY_ASK_DRAFT, multi, 1, 'x'), multi, 1, 'y'), 1),
    ).toBe('x, y')
  })

  it('цифры идут к первому неотвеченному, вставленный путь - в место каретки', () => {
    const draft = togglePick(EMPTY_ASK_DRAFT, single, 0, 'A')

    expect(firstUnanswered([single, multi], draft)).toBe(1)
    expect(askAnswered([single, multi], draft)).toBe(false)
    expect(
      pasteIntoOwnAnswer({ picks: {}, custom: { 0: 'see here' } }, 0, ['/tmp/a.png'], 3, 3)
        .custom[0],
    ).toBe('see /tmp/a.png here')
  })
})

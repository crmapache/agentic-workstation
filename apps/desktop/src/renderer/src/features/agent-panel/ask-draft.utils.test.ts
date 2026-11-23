import { it, expect, describe } from 'vitest'

import {
  answerFor,
  togglePick,
  askAnswered,
  openOwnAnswer,
  ownAnswerText,
  writeOwnAnswer,
  EMPTY_ASK_DRAFT,
  firstUnanswered,
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

  it('цифры идут к первому неотвеченному', () => {
    const draft = togglePick(EMPTY_ASK_DRAFT, single, 0, 'A')

    expect(firstUnanswered([single, multi], draft)).toBe(1)
    expect(askAnswered([single, multi], draft)).toBe(false)
  })

  it('свой ответ - текстом: файл и картинка ссылкой на путь, незаписанная вставка - без ссылки', () => {
    const tokens = [
      { kind: 'text' as const, value: 'see ' },
      { kind: 'chip' as const, chip: { kind: 'file' as const, value: 'src/app.ts' } },
      { kind: 'text' as const, value: ' and ' },
      {
        kind: 'chip' as const,
        chip: { kind: 'img' as const, value: 'Image #1', data: 'data:', path: '/p/image 1.png' },
      },
      { kind: 'chip' as const, chip: { kind: 'img' as const, value: 'Image #2', data: 'data:' } },
    ]
    const draft = writeOwnAnswer(openOwnAnswer(EMPTY_ASK_DRAFT, single, 0), 0, tokens)

    expect(ownAnswerText(tokens)).toBe('see @src/app.ts and @/p/image 1.png')
    expect(answerFor(draft, 0)).toBe('see @src/app.ts and @/p/image 1.png')
    expect(answerFor(openOwnAnswer(EMPTY_ASK_DRAFT, single, 0), 0)).toBe('')
  })
})

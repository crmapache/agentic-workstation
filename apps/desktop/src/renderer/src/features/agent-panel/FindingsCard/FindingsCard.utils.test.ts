import { it, expect, describe } from 'vitest'

import { readReview, findingPlace } from './FindingsCard.utils'

/** Так /code-review отвечает в потоковом режиме: строка вступления и блок json. */
const report = (findings: unknown): string =>
  `I've completed the review. Here are the findings.\n\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``

const finding = {
  file: 'lib/sync/metrics.ts',
  line: 66,
  summary: '`metrics.phone_calls` is not selectable on the `customer` report.',
  failure_scenario: 'The account-level request is rejected and every container lands unread.',
}

describe('readReview', () => {
  it('забирает находки из блока, вступление оставляет как было', () => {
    const review = readReview(report([finding]))

    expect(review?.intro).toBe("I've completed the review. Here are the findings.")
    expect(review?.findings).toEqual([
      {
        file: 'lib/sync/metrics.ts',
        line: 66,
        summary: '`metrics.phone_calls` is not selectable on the `customer` report.',
        failureScenario: 'The account-level request is rejected and every container lands unread.',
      },
    ])
  })

  it('держит необязательные поля, которые прислало ревью', () => {
    const review = readReview(
      report([
        {
          ...finding,
          category: 'correctness',
          verdict: 'PLAUSIBLE',
          outcome: 'fixed',
          short_summary: 'not selectable',
        },
      ]),
    )

    expect(review?.findings[0]).toMatchObject({
      category: 'correctness',
      verdict: 'PLAUSIBLE',
      outcome: 'fixed',
      shortSummary: 'not selectable',
    })
  })

  // Значение вне набора инструмента карточке ничего не говорит - стало бы непонятной меткой.
  it('выбрасывает незнакомые вердикт и исход', () => {
    const review = readReview(report([{ ...finding, verdict: 'MAYBE', outcome: 'pondered' }]))

    expect(review?.findings[0]?.verdict).toBeUndefined()
    expect(review?.findings[0]?.outcome).toBeUndefined()
  })

  // Та же строка дважды - не короче summary, и показалась бы дважды: в шапке и в теле.
  it('не берёт короткую подпись, равную summary', () => {
    const review = readReview(report([{ ...finding, short_summary: finding.summary }]))

    expect(review?.findings[0]?.shortSummary).toBeUndefined()
  })

  it('не отчёт, если у находки нет обязательных полей', () => {
    expect(readReview(report([{ file: 'a.ts', summary: 'looks wrong' }]))).toBeNull()
    expect(readReview(report([finding, { file: 'b.ts' }]))).toBeNull()
  })

  it('не отчёт, если в блоке что-то другое', () => {
    expect(readReview(report([]))).toBeNull()
    expect(readReview('```json\n{"file": "a.ts"}\n```')).toBeNull()
    expect(readReview('```json\n[1, 2, 3]\n```')).toBeNull()
    expect(readReview('```json\n[{"file":\n```')).toBeNull()
    expect(readReview('An ordinary answer about a `/code-review` run, with no block.')).toBeNull()
  })

  // Блок не всегда помечен json, и рядом бывают другие блоки - кусок кода, о котором ревью.
  it('находит находки среди других блоков', () => {
    const text = `Here is the line:\n\n\`\`\`ts\nconst a = 1\n\`\`\`\n\n\`\`\`\n${JSON.stringify([finding])}\n\`\`\``
    const review = readReview(text)

    expect(review?.findings).toHaveLength(1)
    expect(review?.intro).toContain('const a = 1')
  })
})

describe('findingPlace', () => {
  it('имя файла и строка', () => {
    expect(
      findingPlace({ file: 'lib/sync/metrics.ts', line: 66, summary: 'x', failureScenario: 'y' }),
    ).toBe('metrics.ts:66')
  })

  it('только имя файла, если строки нет', () => {
    expect(findingPlace({ file: 'lib/sync/metrics.ts', summary: 'x', failureScenario: 'y' })).toBe(
      'metrics.ts',
    )
  })
})

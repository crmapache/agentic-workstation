import { FENCED, OUTCOMES, VERDICTS } from './FindingsCard.constants'
import type { Finding, ReviewReport } from './FindingsCard.types'

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Все три поля обязательны у самого инструмента ревью, и здесь тоже: проверка мягче
 * («файл и фраза») поймала бы любой список объектов, который напечатал агент.
 */
const readFinding = (value: unknown): Finding | null => {
  const data = asRecord(value)

  if (!data) return null

  const file = str(data['file'])
  const summary = str(data['summary'])
  const failureScenario = str(data['failure_scenario'])

  if (!file || !summary || !failureScenario) return null

  const line = data['line']
  const verdict = str(data['verdict'])
  const outcome = str(data['outcome'])
  const shortSummary = str(data['short_summary'])
  const category = str(data['category'])

  return {
    file,
    ...(typeof line === 'number' && Number.isFinite(line) ? { line } : {}),
    summary,
    failureScenario,
    ...(shortSummary && shortSummary !== summary ? { shortSummary } : {}),
    ...(category ? { category } : {}),
    ...(VERDICTS.has(verdict) ? { verdict: verdict as Finding['verdict'] } : {}),
    ...(OUTCOMES.has(outcome) ? { outcome: outcome as Finding['outcome'] } : {}),
  }
}

/**
 * Находки код-ревью внутри ответа или null, если это не отчёт ревью. /code-review CLI
 * выполняет сам и в потоковом режиме отдаёт итог обычным ответом: строка вступления и
 * блок json. Узнаётся по форме данных, а не по вступлению; пустой список - не отчёт.
 */
export const readReview = (text: string): ReviewReport | null => {
  for (const match of text.matchAll(FENCED)) {
    const body = match[1]

    if (!body?.trimStart().startsWith('[')) continue

    let parsed: unknown

    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }

    if (!Array.isArray(parsed) || parsed.length === 0) continue

    const findings = parsed.map(readFinding)

    if (findings.some((finding) => finding === null)) continue

    return { intro: text.replace(match[0], '').trim(), findings: findings as Finding[] }
  }

  return null
}

/** Где находка - одним словом для шапки строки: имя файла и строка в нём. */
export const findingPlace = (finding: Finding): string => {
  const name = finding.file.split('/').pop() || finding.file

  return finding.line === undefined ? name : `${name}:${finding.line}`
}

/**
 * Находка код-ревью, как её отдаёт инструмент ревью: место, утверждение и как оно
 * ломается. failureScenario - всё доказательство, и самое длинное поле из трёх.
 */
export type Finding = {
  file: string
  line?: number | undefined
  summary: string
  failureScenario: string
  /** Сжатая подпись для шапки строки, если ревью прислало её короче summary. */
  shortSummary?: string | undefined
  /** Вид находки одним словом: correctness, simplification, efficiency. */
  category?: string | undefined
  /** Есть, если ревью гоняло проверку; PLAUSIBLE - проверка не подтвердила. */
  verdict?: 'CONFIRMED' | 'PLAUSIBLE' | undefined
  /** Что стало с находкой потом - только в отчёте, присланном после исправлений. */
  outcome?: FindingOutcome | undefined
}

export type FindingOutcome = 'fixed' | 'skipped' | 'no_change_needed'

/** Отчёт ревью внутри ответа: что сказано вокруг блока и находки из блока. */
export type ReviewReport = { intro: string; findings: Finding[] }

export type FindingsCardProps = {
  findings: readonly Finding[]
}

export type FindingRowProps = {
  finding: Finding
}

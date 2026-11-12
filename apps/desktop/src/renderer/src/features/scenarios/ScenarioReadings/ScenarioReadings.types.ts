/** Показание прибора: подпись и значение («active 4m 12s», «tokens 120k»). */
export type ScenarioReading = { key: string; label: string; value: string }

export type ScenarioReadingsProps = { readings: readonly ScenarioReading[] }

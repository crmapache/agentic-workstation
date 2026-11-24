/** Фон процесса CLI, который переживает ход: что о нём знает сборщик ленты провайдера. */
export type BackgroundSource = {
  readonly hasBackgroundWork: boolean
  readonly hasBackgroundCommands: boolean
  readonly hasWakeup: boolean
}

/**
 * Ход кончился, а работа запроса - нет: идут фоновые агенты или флот, фоновая команда,
 * наблюдатель Monitor, или агент поставил себе будильник. Всё это CLI держит в своём процессе
 * и сам будит агента новым ходом: отчётом агента, концом команды, событием наблюдателя, сроком
 * будильника. У команды и наблюдателя на CLI 2.1.293 всегда есть срок (команда - до 2 ч,
 * наблюдатель - до 30 мин), и по нему они тоже будят агента, так что dev-сервер в фоне держит
 * работу не вечно. Пока так - «готово» не звучит, вкладка горит «работает», часы «Worked» идут,
 * а процесс не спит и не перезапускается: сон убил бы фон молча.
 */
export const awaitsBackground = (source: BackgroundSource): boolean =>
  source.hasBackgroundWork || source.hasBackgroundCommands || source.hasWakeup
